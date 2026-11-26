import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { newMessage } from '../atendimento';
import { atualizarConversa } from './ana.server';
import { renderizarOficial } from './biblioteca/renderizar';
import { bloqueioT09, comItensT09, itensNovosT09, TEXTO_BLOQUEIO_T09 } from './checklist-trabalhista';
import { contextoSecretaria } from './secretaria/secretaria.server';

type Db = SupabaseClient<Database>;

/**
 * Envio do checklist trabalhista oficial (T09) autorizado pela equipe dona da conversa (que confirma que o caso é
 * trabalhista). Texto exato da biblioteca (versão salva), reserva antes do envio, recibo do WhatsApp, nunca reenvia
 * sozinho; depois do recibo, os itens do T09 entram no checklist estruturado (sem duplicar; checklist já aprovado
 * pela Dra. não é alterado).
 */
export async function executarChecklistT09(db: Db, e: { conversaId: string; ownerId: string; autor: string }) {
  const ctx = await contextoSecretaria(db, e.conversaId);
  const oficial = renderizarOficial('T09', {}, { biblioteca: ctx.biblioteca, exigirAtivo: false });
  if (!oficial.ok) throw new Error(TEXTO_BLOQUEIO_T09.modelo_indisponivel);
  const agora = new Date().toISOString();
  let bloqueio: string | undefined;
  await atualizarConversa(db, e.conversaId, c => {
    const b = bloqueioT09(c, ctx.contato) ?? (c.modoIA === 'Desligada' || c.agenteAna?.pausa ? 'conversa_bloqueada' : undefined);
    bloqueio = b ? TEXTO_BLOQUEIO_T09[b] : undefined;
    if (b) return c;
    return { ...c, etiquetaAcao: 'RT', agenteAna: { ...c.agenteAna, checklistTrabalhista: { reservadoEm: agora, autorizadoPor: e.autor }, envioAna: { mensagemId: `t09:${agora}`, texto: oficial.texto, desde: agora } } } as Conversa;
  });
  if (bloqueio) throw new Error(bloqueio);
  const { enviarMensagemSistema } = await import('./envio.functions');
  let sent: { simulado?: boolean; idExterno?: string | undefined };
  try {
    sent = await enviarMensagemSistema({ supabase: db, conversaId: e.conversaId, texto: oficial.texto, motivo: 'checklist_trabalhista', ...(ctx.contato ? { contatoEsperado: ctx.contato } : {}) });
    if (sent.simulado) throw new Error('Canal desligado.');
  } catch (error) {
    // Resultado incerto (o texto pode ter chegado): fica reservado, nunca reenviado sem conferir.
    await atualizarConversa(db, e.conversaId, c => ({ ...c, agenteAna: { ...c.agenteAna, checklistTrabalhista: { ...(c.agenteAna?.checklistTrabalhista ?? { autorizadoPor: e.autor }), falhouEm: new Date().toISOString() } } }));
    await db.rpc('registrar_audit_log', { p_ator: e.autor, p_perfil: 'equipe', p_acao: 'checklistTrabalhista', p_resumo: 'Checklist T09 sem recibo do WhatsApp; conferir antes de reenviar', p_status: 'erro' });
    throw new Error(`Envio do checklist não confirmado pelo WhatsApp (${(error as Error)?.message ?? 'falha'}). Confira a conversa antes de repetir.`);
  }
  // Itens estruturados: só depois do recibo; checklist já aprovado pela Dra. não é alterado.
  const [itens, status] = await Promise.all([
    db.from('checklist_itens').select('nome').eq('caso_id', e.conversaId).eq('owner_id', e.ownerId),
    db.rpc('material_status', { p_case: e.conversaId }),
  ]);
  const aprovado = !!(status.data as { checklist?: boolean } | null)?.checklist;
  let novos = itens.error || aprovado ? [] : itensNovosT09((itens.data ?? []).map(i => i.nome));
  if (novos.length) {
    const ins = await db.from('checklist_itens').insert(novos.map((nome, i) => ({ caso_id: e.conversaId, owner_id: e.ownerId, nome, recebido: false, ordem: (itens.data?.length ?? 0) + i })));
    if (ins.error) novos = [];
  }
  await atualizarConversa(db, e.conversaId, c => ({
    ...c,
    documentos: novos.length ? comItensT09(c.documentos, novos) : c.documentos,
    agenteAna: { ...c.agenteAna, envioAna: undefined, checklistTrabalhista: { ...(c.agenteAna?.checklistTrabalhista ?? { autorizadoPor: e.autor }), enviadoEm: new Date().toISOString(), idExterno: sent.idExterno, itens: novos } },
    mensagens: [...c.mensagens, newMessage(oficial.texto, { autor: `${e.autor} · checklist oficial`, canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada', modeloOficial: { id: oficial.id, versao: oficial.versao } })],
    timeline: [...c.timeline, { data: new Date().toISOString(), evento: `Checklist trabalhista oficial (T09) enviado com autorização de ${e.autor}${novos.length ? ` · ${novos.length} itens no checklist` : aprovado ? ' · checklist já aprovado: itens não alterados' : ''}` }],
  }));
  await db.rpc('registrar_audit_log', { p_ator: e.autor, p_perfil: 'equipe', p_acao: 'checklistTrabalhista', p_resumo: `Checklist T09 enviado com recibo · ${novos.length} itens`, p_status: 'sucesso' });
  return { ok: true as const, itens: novos.length, checklistAprovado: aprovado };
}
