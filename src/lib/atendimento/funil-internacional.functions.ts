import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Conversa } from '@/lib/mock-data';

/** Botão "PIX Confirmado": a equipe confirma o pagamento e libera a Anne a ofertar os horários. */
export const confirmarPagamentoFunil = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ conversaId: z.string().uuid() })).handler(async ({ data, context }) => {
  const { atualizarConversa } = await import('./ana.server');
  const { msgPagoComHorarios } = await import('./funil-internacional');
  const { linhaDoisHorariosAna, PERGUNTA_HORARIO_ANA } = await import('./ana-rules');
  const { selecionarOpcoesAna, horizonteAgendaAna } = await import('./ana-scheduling');
  const { ocupadosAgenda } = await import('./projuris-agenda.server');
  const { newMessage } = await import('../atendimento');
  const row = await context.supabase.from('casos').select('dados').eq('id', data.conversaId).eq('owner_id', context.userId).single();
  if (row.error || !row.data) throw new Error('Atendimento indisponível para este responsável.');
  const c = row.data.dados as unknown as Conversa;
  if (!c.funilInternacional) throw new Error('Esta conversa não está no funil internacional.');
  if (c.funilInternacional.etapa === 'pago') throw new Error('Pagamento já confirmado.');
  const now = new Date();
  const busy = (await ocupadosAgenda(context.supabase, context.userId, now, horizonteAgendaAna())) ?? [];
  const tipo = c.tipoClienteAgenda ?? 'novo';
  const horarios = selecionarOpcoesAna(busy, now, tipo).slots;
  if (!horarios.length) throw new Error('Sem horários livres na agenda; nada foi enviado.');
  const MSG_PAGO = msgPagoComHorarios(linhaDoisHorariosAna(horarios, now), PERGUNTA_HORARIO_ANA);
  const { enviarMensagemSistema } = await import('./envio.functions');
  const sent = await enviarMensagemSistema({ supabase: context.supabase, conversaId: data.conversaId, texto: MSG_PAGO, motivo: 'funil-pagamento-confirmado', horarios });
  await atualizarConversa(context.supabase, data.conversaId, x => ({ ...x, funilInternacional: { ...x.funilInternacional!, etapa: 'pago', confirmadoEm: new Date().toISOString(), confirmadoPor: context.userId }, horariosOfertados: horarios, agenteAna: { ...x.agenteAna, tipoCliente: tipo, horariosTeste: horarios, agendaReal: true, horariosApresentados: [...new Set([...(x.agenteAna?.horariosApresentados ?? []), ...horarios])], listasHorarios: (x.agenteAna?.listasHorarios ?? 0) + 1 } as NonNullable<typeof x.agenteAna>, timeline: [...x.timeline, { data: new Date().toISOString(), evento: 'Funil internacional: pagamento confirmado pela equipe; Anne liberada para ofertar horários.' }], mensagens: [...x.mensagens, newMessage(MSG_PAGO, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada' })] }));
  return { ok: true };
});
