import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const conferirMigracaoAgenda = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
  if (roles.error || !roles.data?.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Conferência reservada à advogada sênior ou administração.');
  const { lerInventario, guardarMigracao } = await import('./projuris/migracao.server');
  const inventario = await lerInventario();
  await guardarMigracao(context.supabase, context.userId, { etapa: 'inventario', inventario });
  const row = await context.supabase.from('office_workspace').select('dados').eq('owner_id', context.userId).single();
  if (row.error) throw new Error('Histórico da conferência indisponível.');
  const registros = (row.data.dados as Record<string, unknown>)['migracaoAgenda'];
  const historico = (Array.isArray(registros) ? registros : []).filter(r => r && typeof r === 'object' && r['origem']).map(r => ({ origem: String(r['origem']), etapa: String(r['etapa']), em: String(r['em']) }));
  return { ...inventario, historico };
});
export const executarMigracaoAgenda = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().min(1).max(1024), etag: z.string().min(1).max(1024), confirmado: z.literal(true) }))
  .handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data?.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Migração reservada à advogada sênior ou administração.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { migrarEvento } = await import('./projuris/migracao.server');
    return migrarEvento(supabaseAdmin, context.userId, data.id, data.etag);
  });