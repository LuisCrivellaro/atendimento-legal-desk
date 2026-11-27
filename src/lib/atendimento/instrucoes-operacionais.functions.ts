import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import {
  consultasNoPeriodo, dataHoraSP, desativarInstrucao, editarInstrucao, lerInstrucoes, limitarHistorico, novaInstrucao, prepararInstrucao,
  situacaoInstrucao, type InstrucaoOperacional, type RegraOperacional,
} from './instrucoes-operacionais';

/**
 * Avisos e instruções operacionais da Anne (Treinamento de IA → Orientações).
 * - Leitura: qualquer usuário autenticado vê as instruções da própria área de trabalho.
 * - Interpretar, ativar, editar e desativar: só advogada sênior ou admin (`user_roles`), gravado pelo servidor com CAS
 *   em `office_workspace.dados.instrucoesOperacionais` (preservado pelo `saveOffice`, que nunca o grava do navegador).
 * - A regra estruturada vem sempre da interpretação do servidor; o navegador só confirma ajustes de validade/período.
 * - Mensagens de clientes (WhatsApp) nunca chegam aqui: não existe caminho do webhook/Anne para estas funções.
 */
type Db = SupabaseClient<Database>;

async function ehGestor(supabase: Db, userId: string) {
  const [senior, admin] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'advogada_senior' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  return !!senior.data || !!admin.data;
}
async function exigirGestor(supabase: Db, userId: string) {
  if (!(await ehGestor(supabase, userId))) throw new Error('Somente advogada sênior ou admin pode criar, editar ou desativar instruções da Anne.');
}
async function nomeDoUsuario(supabase: Db, userId: string) {
  const r = await supabase.from('profiles').select('nome').eq('id', userId).maybeSingle();
  return String(r.data?.nome ?? 'equipe').slice(0, 80);
}
async function auditar(supabase: Db, ator: string, acao: string, resumo: string) {
  const r = await supabase.rpc('registrar_audit_log', { p_ator: ator, p_perfil: 'equipe', p_acao: acao, p_resumo: resumo.slice(0, 300), p_status: 'sucesso' });
  if (r.error) console.error('Auditoria da instrução operacional não registrada', r.error);
}
async function lerArea(supabase: Db, owner: string) {
  const row = await supabase.from('office_workspace').select('dados,updated_at').eq('owner_id', owner).maybeSingle();
  if (row.error) throw new Error('Instruções indisponíveis.');
  return row;
}
/** Grava a lista com CAS pelo updated_at (5 tentativas), relendo o estado a cada tentativa. */
async function gravar(supabase: Db, owner: string, alterar: (lista: InstrucaoOperacional[]) => InstrucaoOperacional[]) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const row = await lerArea(supabase, owner);
    const atual = lerInstrucoes(row.data?.dados);
    const lista = limitarHistorico(alterar(atual));
    const dados = { ...((row.data?.dados as Record<string, unknown> | null) ?? {}), instrucoesOperacionais: lista };
    const r = row.data
      ? await supabase.from('office_workspace').update({ dados: JSON.parse(JSON.stringify(dados)) as Json, updated_at: new Date().toISOString() }).eq('owner_id', owner).eq('updated_at', row.data.updated_at).select('owner_id')
      : await supabase.from('office_workspace').insert({ owner_id: owner, dados: JSON.parse(JSON.stringify(dados)) as Json }).select('owner_id');
    if (r.error) throw new Error('Não foi possível salvar a instrução.');
    if (r.data?.length) return lista;
  }
  throw new Error('Área de trabalho alterada ao mesmo tempo. Tente de novo.');
}

/** Consultas já marcadas (com recibo) dentro dos períodos bloqueados: só para avisar; nada é cancelado ou alterado. */
async function consultasAfetadas(supabase: Db, owner: string, regras: RegraOperacional[], agora: Date) {
  if (!regras.some(r => r.tipo === 'bloquear_periodo_agenda')) return [];
  const rows = await supabase.from('casos').select('id,dados').eq('owner_id', owner).not('dados->>consultaAgendada', 'is', null);
  if (rows.error) throw new Error('Não foi possível conferir as consultas já marcadas.');
  const marcadas = (rows.data ?? []).flatMap(r => {
    const c = r.dados as unknown as Conversa;
    return c?.consultaAgendada && Date.parse(c.consultaAgendada) + 30 * 60000 > agora.getTime() ? [{ conversaId: r.id, inicio: c.consultaAgendada, nome: c.agenteAna?.dados?.nome || c.nome || 'Cliente' }] : [];
  });
  const dentro = new Set(consultasNoPeriodo(regras, marcadas).map(c => `${c.conversaId}|${c.inicio}`));
  return marcadas.filter(c => dentro.has(`${c.conversaId}|${c.inicio}`)).sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const esquemaAjustes = z.object({
  titulo: z.string().max(120).optional(),
  categoria: z.string().max(40).optional(),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'critica']).optional(),
  tipo: z.enum(['temporaria', 'permanente']).optional(),
  inicio: z.string().max(40).optional(),
  fim: z.string().max(40).nullable().optional(),
  periodoBloqueio: z.object({ inicio: z.string().max(40), fim: z.string().max(40) }).optional(),
  somenteOrientacao: z.boolean().optional(),
});

/** Lista com a situação calculada agora (programada/ativa/expirada/desativada) e se o perfil pode editar. */
export const lerInstrucoesOperacionaisAnne = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await lerArea(context.supabase, context.userId);
    const agora = new Date();
    const lista = lerInstrucoes(row.data?.dados).map(i => ({ ...i, situacao: situacaoInstrucao(i, agora) }));
    return { lista, agora: agora.toISOString(), podeEditar: await ehGestor(context.supabase, context.userId) };
  });

/** Prévia da interpretação (nada é gravado): regras, validade absoluta, funções afetadas, conflitos e consultas no período. */
export const interpretarInstrucaoAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ texto: z.string().max(1000), id: z.string().max(80).optional(), ajustes: esquemaAjustes.optional() }))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase, context.userId);
    const agora = new Date();
    const row = await lerArea(context.supabase, context.userId);
    const existentes = lerInstrucoes(row.data?.dados);
    const preparo = prepararInstrucao(data.texto, data.ajustes ?? {}, existentes, agora, data.id);
    const regras = preparo.ok ? preparo.dados.regras : preparo.interpretacao?.regras ?? [];
    const consultas = await consultasAfetadas(context.supabase, context.userId, regras, agora);
    return {
      ok: preparo.ok,
      erros: preparo.ok ? [] : preparo.erros,
      avisos: preparo.ok ? preparo.avisos : preparo.interpretacao?.observacoes ?? [],
      interpretacao: preparo.interpretacao ?? null,
      final: preparo.ok ? preparo.dados : null,
      consultas: consultas.map(c => ({ ...c, quando: dataHoraSP(c.inicio) })),
    };
  });

/** Ativa (cria) ou edita uma instrução depois da confirmação explícita da interpretação. */
export const salvarInstrucaoAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ texto: z.string().max(1000), id: z.string().max(80).optional(), ajustes: esquemaAjustes, confirmado: z.literal(true) }))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase, context.userId);
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const agora = new Date();
    const res: { salva?: InstrucaoOperacional | undefined; erro?: string[] | undefined } = {};
    await gravar(context.supabase, context.userId, lista => {
      res.salva = undefined; res.erro = undefined;
      const atual = data.id ? lista.find(i => i.id === data.id) : undefined;
      if (data.id && !atual) { res.erro = ['Instrução não encontrada.']; return lista; }
      if (atual && !['ativa', 'programada'].includes(situacaoInstrucao(atual, agora))) { res.erro = ['Instrução expirada ou desativada não é editada: crie uma nova.']; return lista; }
      const preparo = prepararInstrucao(data.texto, data.ajustes, lista, agora, data.id);
      if (!preparo.ok) { res.erro = preparo.erros; return lista; }
      const nova = atual ? editarInstrucao(atual, preparo.dados, autor, agora) : novaInstrucao({ id: `instrucao:${agora.getTime()}:${crypto.randomUUID().slice(0, 8)}`, ...preparo.dados }, autor, agora);
      res.salva = nova;
      return atual ? lista.map(i => (i.id === atual.id ? nova : i)) : [...lista, nova];
    });
    const instrucao = res.salva;
    if (res.erro || !instrucao) throw new Error((res.erro ?? ['Não foi possível salvar a instrução.']).join(' '));
    // Consultas já marcadas no período bloqueado: aviso para a equipe em cada conversa (nada é cancelado ou alterado).
    const consultas = await consultasAfetadas(context.supabase, context.userId, instrucao.regras, agora);
    if (consultas.length) {
      const { atualizarConversa } = await import('./ana.server');
      const { registrarAviso } = await import('./avisos-equipe');
      for (const c of consultas) {
        await atualizarConversa(context.supabase, c.conversaId, x => registrarAviso(x, {
          id: `instrucao:${instrucao.id}:v${instrucao.versao}:${c.inicio}`, tipo: 'instrucao', prioridade: true, criadoEm: agora.toISOString(),
          texto: `Consulta de ${dataHoraSP(c.inicio)} está no período bloqueado pela instrução "${instrucao.titulo}". Nada foi cancelado nem alterado: a equipe decide se fala com o cliente.`.slice(0, 300),
        })).catch(e => console.error('Aviso de consulta no período bloqueado não registrado', e));
      }
    }
    await auditar(context.supabase, autor, data.id ? 'instrucaoAnneEditada' : 'instrucaoAnneCriada', `${instrucao.titulo} · ${instrucao.interpretacao}${consultas.length ? ` · ${consultas.length} consulta(s) já marcada(s) sinalizada(s)` : ''}`);
    return { instrucao: { ...instrucao, situacao: situacaoInstrucao(instrucao, agora) }, consultasSinalizadas: consultas.length };
  });

/** Desativação imediata (a Anne e as rotinas leem a lista a cada ação); o histórico fica guardado. */
export const desativarInstrucaoAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().max(80) }))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase, context.userId);
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const agora = new Date();
    let titulo = '';
    await gravar(context.supabase, context.userId, lista => lista.map(i => {
      if (i.id !== data.id) return i;
      titulo = i.titulo;
      return desativarInstrucao(i, autor, agora);
    }));
    if (!titulo) throw new Error('Instrução não encontrada.');
    await auditar(context.supabase, autor, 'instrucaoAnneDesativada', titulo);
    return { ok: true as const };
  });
