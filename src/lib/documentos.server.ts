import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from './mock-data';
import { executarAnaliseDocumento } from './documentos.functions';
import { itemIdentificado } from './documentos-rules';
import { atualizarConversa } from './atendimento/ana.server';
import { DOCUMENTOS_BASE } from './atendimento/trato-feito';

/** Chamador já autenticou proprietário ou validou assinatura + contato liberado do webhook. */
export async function analisarAnexoDoCaso(db: SupabaseClient<Database>, casoId: string, owner: string, mensagemId: string, confirmarAlteracao = false) {
  const [row, checklist] = await Promise.all([
    db.from('casos').select('dados').eq('id', casoId).eq('owner_id', owner).single(),
    db.from('checklist_itens').select('id,nome,recebido').eq('caso_id', casoId).eq('owner_id', owner),
  ]);
  if (row.error || checklist.error) throw new Error('Documento indisponível neste atendimento.');
  const c = row.data.dados as unknown as Conversa;
  // Reparação do fluxo antigo: TRATO FEITO registrava a etapa, mas perdia os itens sem ID.
  if (!checklist.data.length && c.timeline?.some(t => t.evento.startsWith('Trato feito'))) {
    const restored = await db.from('checklist_itens').insert(DOCUMENTOS_BASE.map((nome, ordem) => ({ caso_id: casoId, owner_id: owner, nome, ordem, recebido: false }))).select('id,nome,recebido');
    if (restored.error) throw new Error('Não foi possível recuperar a lista de documentos-base.');
    checklist.data.push(...restored.data);
  }
  const m = c.mensagens.find(m => m.id === mensagemId);
  if (!m?.path?.startsWith(`${owner}/${casoId}/`)) throw new Error('Original não disponível neste atendimento.');
  if (m.analiseDocumento && !confirmarAlteracao) return { ok: true as const, resultado: m.analiseDocumento, checklistAtualizado: m.checklistAtualizado === true, pendencia: m.pendenciaChecklist };
  const file = await db.storage.from('case-documents').download(m.path);
  if (file.error || !file.data) throw new Error('Não foi possível ler o original guardado.');
  const mime = file.data.type.split(';')[0] ?? '';
  if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime) || !file.data.size || file.data.size > 10 * 1024 * 1024) throw new Error('Envie PDF ou imagem legível de até 10 MB.');
  const result = m.analiseDocumento ? { ok: true as const, resultado: m.analiseDocumento } : await executarAnaliseDocumento({ filename: m.arquivo ?? 'documento', mimeType: mime, base64: Buffer.from(await file.data.arrayBuffer()).toString('base64'), checklist: checklist.data.map(d => d.nome) });
  if (!result.ok) {
    await atualizarConversa(db, casoId, x => ({ ...x, mensagens: x.mensagens.map(a => a.id === mensagemId ? { ...a, erroAnalise: result.erro } : a) }));
    return result;
  }
  const item = itemIdentificado(result.resultado, checklist.data);
  let marcado = item?.recebido === true;
  let pendencia: string | undefined;
  if (item?.id && !marcado) {
    const status = await db.rpc('material_status', { p_case: casoId });
    if (status.error) pendencia = 'Não foi possível verificar a aprovação; checklist preservado.';
    else if ((status.data as { checklist?: boolean } | null)?.checklist && !confirmarAlteracao) pendencia = 'Checklist aprovado: confirme a alteração para solicitar nova revisão jurídica.';
    else {
      const write = await db.from('checklist_itens').update({ recebido: true, updated_at: new Date().toISOString() }).eq('id', item.id).eq('caso_id', casoId).eq('owner_id', owner).select('id');
      marcado = !write.error && Boolean(write.data?.length);
      if (!marcado) pendencia = 'Documento identificado; não foi possível marcar o checklist. Confira com a equipe.';
    }
  }
  await atualizarConversa(db, casoId, x => ({ ...x,
    mensagens: x.mensagens.map(a => a.id === mensagemId ? { ...a, analiseDocumento: result.resultado, tipoIdentificado: result.resultado.tipoDocumento, confirmarTipo: result.resultado.confianca !== 'alta', checklistAtualizado: marcado, pendenciaChecklist: pendencia, erroAnalise: undefined } : a),
    timeline: x.mensagens.find(a => a.id === mensagemId)?.analiseDocumento ? x.timeline : [...(x.timeline ?? []), { data: new Date().toISOString(), evento: `IA identificou: ${result.resultado.tipoDocumento} (${m.arquivo ?? 'documento'})${marcado ? ' · checklist marcado' : ' · conferência pendente'}` }],
  }));
  return { ...result, checklistAtualizado: marcado, pendencia };
}