import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const conferirMigracaoAgenda = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
  if (roles.error || !roles.data?.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Conferência reservada à advogada sênior ou administração.');
  const { lerInventario, guardarMigracao } = await import('./projuris/migracao.server');
  const inventario = await lerInventario();
  await guardarMigracao(context.supabase, context.userId, { etapa: 'inventario', inventario });
  return inventario;
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