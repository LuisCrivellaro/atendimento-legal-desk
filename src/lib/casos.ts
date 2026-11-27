import { supabase } from "@/integrations/supabase/client";
import type { Conversa, DocItem } from "@/lib/mock-data";
import type { Database, Json } from "@/integrations/supabase/types";
import { ordenarConversas } from './atendimento/conversation-order';
import { mesclarTarefasRetorno } from './atendimento/ana-contexto';

// Casos e checklist do usuário logado (RLS garante que cada um vê só os seus).
export async function listarCasos(): Promise<Conversa[]> {
  const casos: Pick<Database['public']['Tables']['casos']['Row'],'id'|'dados'|'etapa'|'nome'|'last_message_at'>[] = []; const itens: Pick<Database['public']['Tables']['checklist_itens']['Row'],'id'|'caso_id'|'nome'|'recebido'|'ordem'>[] = [];
  // Cursor estável: movimentos no topo não deslocam os limites das páginas antigas.
  let cursor: { id: string; timestamp: string | null } | undefined;
  let semData = false;
  for (;;) {
    let query = supabase.from("casos").select("id,dados,etapa,nome,last_message_at").order('last_message_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(500);
    if (semData) {
      query = query.is('last_message_at', null);
      if (cursor) query = query.lt('id', cursor.id);
    } else {
      query = query.not('last_message_at', 'is', null);
      if (cursor?.timestamp) query = query.or(`last_message_at.lt.${cursor.timestamp},and(last_message_at.eq.${cursor.timestamp},id.lt.${cursor.id})`);
    }
    const r = await query;
    if (r.error) throw r.error;
    casos.push(...r.data);
    const last = r.data.at(-1);
    if (r.data.length < 500) {
      if (semData) break;
      semData = true; cursor = undefined;
    } else if (last) cursor = { id: last.id, timestamp: last.last_message_at };
  }
  for (let offset = 0; ; offset += 500) {
    const r = await supabase.from('checklist_itens').select('id,caso_id,nome,recebido,ordem').order('ordem').order('id').range(offset, offset + 499);
    if (r.error) throw r.error; itens.push(...r.data); if (r.data.length < 500) break;
  }
  const porCaso = agruparItens(itens);
  return [...new Map(casos.map(c => [c.id, c])).values()].map((c) => linhaParaConversa(c, porCaso.get(c.id) ?? [])).sort(ordenarConversas);
}

/**
 * Opções únicas da lista de conversas: carrega uma vez e fica atualizada pelo tempo real (useCasosRealtime).
 * Sem `staleTime`, cada troca de conversa (o Chat remonta) e cada volta de foco recarregava todas as conversas.
 */
export const consultaCasos = { queryKey: ['casos'] as const, queryFn: listarCasos, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;

type LinhaCaso = Pick<Database['public']['Tables']['casos']['Row'],'id'|'dados'|'etapa'|'nome'|'last_message_at'>;
type LinhaItem = Pick<Database['public']['Tables']['checklist_itens']['Row'],'id'|'caso_id'|'nome'|'recebido'|'ordem'>;
const COLUNAS_CASO = 'id,dados,etapa,nome,last_message_at';

/** Agrupa o checklist por caso uma vez (antes: filtro por caso dentro do map, O(casos × itens)). */
function agruparItens(itens: LinhaItem[]) {
  const m = new Map<string, LinhaItem[]>();
  for (const i of itens) { const l = m.get(i.caso_id); if (l) l.push(i); else m.set(i.caso_id, [i]); }
  return m;
}

function linhaParaConversa(c: LinhaCaso, itens: LinhaItem[]): Conversa {
  return {
    ...(c.dados as unknown as Omit<Conversa, "id" | "documentos" | "naoLidas">),
    id: c.id,
    nome: c.nome,
    etapa: c.etapa as Conversa["etapa"],
    lastMessageAt: c.last_message_at,
    naoLidas: 0,
    documentos: itens.map<DocItem>((i) => ({ id: i.id, nome: i.nome, recebido: i.recebido })),
  };
}

/** Uma conversa só (com seu checklist): usada pelo tempo real e depois de salvar, no lugar de recarregar todas. */
export async function carregarCaso(id: string): Promise<Conversa | null> {
  const [caso, itens] = await Promise.all([
    supabase.from('casos').select(COLUNAS_CASO).eq('id', id).maybeSingle(),
    supabase.from('checklist_itens').select('id,caso_id,nome,recebido,ordem').eq('caso_id', id).order('ordem').order('id'),
  ]);
  if (caso.error) throw caso.error;
  if (itens.error) throw itens.error;
  return caso.data ? linhaParaConversa(caso.data, itens.data ?? []) : null;
}

/**
 * Conversas alteradas desde um instante (rede de segurança do tempo real). `updated_at` pode vir do relógio do
 * navegador em salvarCaso, por isso quem chama usa uma folga generosa e uma recarga completa ao reconectar.
 */
export async function casosAlteradosDesde(desde: string): Promise<Conversa[]> {
  const r = await supabase.from('casos').select(COLUNAS_CASO).gte('updated_at', desde).order('updated_at', { ascending: false }).limit(200);
  if (r.error) throw r.error;
  if (!r.data.length) return [];
  const itens = await supabase.from('checklist_itens').select('id,caso_id,nome,recebido,ordem').in('caso_id', r.data.map(c => c.id)).order('ordem').order('id');
  if (itens.error) throw itens.error;
  const porCaso = agruparItens(itens.data ?? []);
  return r.data.map(c => linhaParaConversa(c, porCaso.get(c.id) ?? []));
}

/** Salva com CAS e devolve a conversa como ficou no banco (sem recarregar a lista inteira). */
export async function salvarCaso(antes: Conversa, depois: Conversa): Promise<Conversa> {
  const { id, documentos, naoLidas: _n, lastMessageAt: _last, ...dados } = depois;
  const novos = documentos.filter(d => !d.id);
  if (novos.length) {
    const owner = await supabase.from('casos').select('owner_id').eq('id', id).single();
    if (owner.error) throw owner.error;
    const existentes = await supabase.from('checklist_itens').select('id,nome,recebido').eq('caso_id', id);
    if (existentes.error) throw existentes.error;
    const faltantes = novos.filter(d => !existentes.data.some(x => x.nome === d.nome));
    if (faltantes.length) {
      const insert = await supabase.from('checklist_itens').insert(faltantes.map((d, i) => ({ caso_id: id, owner_id: owner.data.owner_id, nome: d.nome, recebido: d.recebido, ordem: existentes.data.length + i }))).select('id,nome,recebido');
      if (insert.error) throw insert.error;
      existentes.data.push(...insert.data);
    }
    documentos.forEach(d => { if (!d.id) d.id = existentes.data.find(x => x.nome === d.nome)?.id; });
  }
  // Não sobrescrever mensagens/estado da Ana que chegaram depois da última leitura da equipe.
  let saved: LinhaCaso | undefined;
  for(let attempt=0;attempt<5;attempt++) {
    const row=await supabase.from('casos').select('dados,updated_at').eq('id',id).single();
    if(row.error)throw row.error;
    const current=row.data.dados as unknown as Conversa;
    const incoming=new Map((current.mensagens??[]).map(m=>[m.id,m]));
    const merged=depois.mensagens.filter(m=>antes.mensagens.some(x=>x.id===m.id)||!m.idExterno||!current.mensagens.some(x=>x.idExterno===m.idExterno&&x.de===m.de)).map(m=>{const original=antes.mensagens.find(x=>x.id===m.id);const fresh=incoming.get(m.id);incoming.delete(m.id);return original&&fresh&&JSON.stringify(original)===JSON.stringify(m)?fresh:m;});
    const lidoAte=[current.lidoAte,depois.lidoAte].filter((v):v is string=>!!v&&Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
    const data={...dados,lidoAte,...(antes.email===depois.email?{email:current.email}:{}),mensagens:[...merged,...incoming.values()],agenteAna:{...(JSON.stringify(antes.agenteAna)===JSON.stringify(depois.agenteAna)?current.agenteAna:depois.agenteAna),pedidosProcesso:current.agenteAna?.pedidosProcesso,aguardandoAssuntoProcesso:current.agenteAna?.aguardandoAssuntoProcesso,consultaProcessoEmCurso:current.agenteAna?.consultaProcessoEmCurso,vinculoProjuris:current.agenteAna?.vinculoProjuris,aguardandoCpfProcesso:current.agenteAna?.aguardandoCpfProcesso,perguntaProcessoPendente:current.agenteAna?.perguntaProcessoPendente},...(antes.iaRetida===depois.iaRetida?{iaRetida:current.iaRetida}:{})};
    const r=await supabase.from('casos').update({dados:JSON.parse(JSON.stringify({...data,tarefasRetorno:mesclarTarefasRetorno(antes.tarefasRetorno,depois.tarefasRetorno,current.tarefasRetorno),avisosEquipe:mesclarTarefasRetorno(antes.avisosEquipe,depois.avisosEquipe,current.avisosEquipe),encaminhamentos:current.encaminhamentos})) as Json,etapa:depois.etapa,nome:depois.nome,updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',row.data.updated_at).select(COLUNAS_CASO);
    if(r.error)throw r.error;
    if(r.data?.length){saved=r.data[0];break;}
  }
  if(!saved)throw new Error('Conversa mudou durante o salvamento. Atualize e tente novamente.');
  const mudados = documentos.filter((d) => d.id && antes.documentos.find((a) => a.id === d.id)?.recebido !== d.recebido);
  for (const d of mudados) {
    if (!d.id) continue;
    const r = await supabase.from("checklist_itens").update({ recebido: d.recebido, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (r.error) throw r.error;
  }
  return { ...linhaParaConversa(saved, []), documentos: documentos.map(d => ({ ...d })) };
}
