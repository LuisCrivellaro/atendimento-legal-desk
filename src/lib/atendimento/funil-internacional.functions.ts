import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Conversa } from '@/lib/mock-data';

/** Botão "PIX Confirmado": a equipe confirma o pagamento e libera a Anne a ofertar os horários. */
export const confirmarPagamentoFunil = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ conversaId: z.string().uuid() })).handler(async ({ data, context }) => {
  const { atualizarConversa } = await import('./ana.server');
  const { MSG_PAGO } = await import('./funil-internacional');
  const { newMessage } = await import('../atendimento');
  const row = await context.supabase.from('casos').select('dados').eq('id', data.conversaId).eq('owner_id', context.userId).single();
  if (row.error || !row.data) throw new Error('Atendimento indisponível para este responsável.');
  const c = row.data.dados as unknown as Conversa;
  if (!c.funilInternacional) throw new Error('Esta conversa não está no funil internacional.');
  if (c.funilInternacional.etapa === 'pago') throw new Error('Pagamento já confirmado.');
  const { enviarMensagemSistema } = await import('./envio.functions');
  const sent = await enviarMensagemSistema({ supabase: context.supabase, conversaId: data.conversaId, texto: MSG_PAGO, motivo: 'funil-pagamento-confirmado' });
  await atualizarConversa(context.supabase, data.conversaId, x => ({ ...x, funilInternacional: { ...x.funilInternacional!, etapa: 'pago', confirmadoEm: new Date().toISOString(), confirmadoPor: context.userId }, timeline: [...x.timeline, { data: new Date().toISOString(), evento: 'Funil internacional: pagamento confirmado pela equipe; Anne liberada para ofertar horários.' }], mensagens: [...x.mensagens, newMessage(MSG_PAGO, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada' })] }));
  return { ok: true };
});
