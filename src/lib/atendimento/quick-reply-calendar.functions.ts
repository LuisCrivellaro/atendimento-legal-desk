import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Leitura owner-scoped: não salva oferta, não aciona Ana e não envia mensagens. */
export const consultarDadosMensagem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ casoId: z.string().uuid(), atalho: z.enum(['consulta', 'reagendar', 'confirmar', 'lembreteconsulta']) }))
  .handler(async ({ data, context }) => {
    const row = await context.supabase.from('casos').select('dados').eq('id', data.casoId).eq('owner_id', context.userId).single();
    if (row.error || !row.data) throw new Error('Atendimento indisponível para seu usuário.');
    const c = { ...(row.data.dados as unknown as import('../mock-data').Conversa), id: data.casoId };
    const { resolveReplyCalendar } = await import('./quick-reply-calendar.server');
    const { ocupadosAgenda, lerReservaAgenda } = await import('./projuris-agenda.server');
    return resolveReplyCalendar(c, data.atalho, {
      busy: (now, dias) => ocupadosAgenda(context.supabase, context.userId, now, dias),
      read: (_id, reserva) => lerReservaAgenda(context.supabase, context.userId, data.casoId, reserva),
    });
  });