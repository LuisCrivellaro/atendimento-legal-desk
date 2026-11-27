import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * A equipe marca a pendência do advogado: em atendimento, respondido ou concluído (nunca reabre uma concluída).
 * Só o dono da conversa (mesma regra das demais ações do Atendimento); gravação com CAS e auditoria.
 * Resposta efetiva da equipe pelo WhatsApp já tira o cliente da lista sozinha (situação derivada das mensagens).
 */
export const marcarEncaminhamentoAdvogado = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), encaminhamentoId: z.string().min(1).max(300), status: z.enum(['em_atendimento', 'respondido', 'concluido']) }))
  .handler(async ({ data, context }) => {
    const row = await context.supabase.from('casos').select('owner_id').eq('id', data.conversaId).single();
    if (row.error || row.data.owner_id !== context.userId) throw new Error('Conversa indisponível para esta conta.');
    const perfil = await context.supabase.from('profiles').select('nome').eq('id', context.userId).maybeSingle();
    const autor = String(perfil.data?.nome ?? 'equipe').slice(0, 80);
    const { marcarEncaminhamento, ROTULO_STATUS_ENCAMINHAMENTO } = await import('./encaminhamento-advogado');
    const { atualizarConversa } = await import('./ana.server');
    let ok = false;
    await atualizarConversa(context.supabase, data.conversaId, c => {
      const r = marcarEncaminhamento(c, data.encaminhamentoId, data.status, autor);
      ok = r.ok;
      return r.conversa;
    });
    if (!ok) throw new Error('Pendência já concluída ou alterada; atualize a conversa.');
    const audit = await context.supabase.rpc('registrar_audit_log', { p_ator: autor, p_perfil: 'equipe', p_acao: 'encaminhamentoAdvogado', p_resumo: `Pendência do advogado: ${ROTULO_STATUS_ENCAMINHAMENTO[data.status]}`, p_status: 'sucesso' });
    if (audit.error) throw new Error('Alteração salva; auditoria pendente. Atualize a conversa.');
    return { ok: true as const };
  });
