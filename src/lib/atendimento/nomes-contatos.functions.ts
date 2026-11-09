import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const lerNomesWhatsApp = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { lerAgendaWhatsApp } = await import('./nomes-contatos.server');
  return await lerAgendaWhatsApp(context.supabase, context.userId) ?? null;
});
export const atualizarNomesWhatsApp = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const r = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
  if (r.error || !r.data?.some(x => x.role === 'admin' || x.role === 'advogada_senior')) throw new Error('Somente a advogada sênior ou administração pode atualizar a agenda.');
  const { sincronizarNomesWhatsApp } = await import('./nomes-contatos.server');
  const { agenda, atualizados } = await sincronizarNomesWhatsApp(context.supabase, context.userId);
  return { atualizados, sincronizadoEm: agenda.sincronizadoEm, ambiguos: agenda.ambiguos };
});