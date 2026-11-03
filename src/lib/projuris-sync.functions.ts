import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const monitorarProjuris = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
  if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) return { autorizado: false as const };
  const { lerBase } = await import('./projuris/base.server');
  const { processosDaBase } = await import('./projuris/base');
  const { numeroIdentificadorProcesso } = await import('./projuris/diretorio');
  const { base, estado } = await lerBase(context.supabase, context.userId);
  const [sync, versoes] = await Promise.all([
    context.supabase.from('projuris_sync_processos').select('*').eq('owner_id', context.userId),
    context.supabase.from('projuris_movimento_versoes').select('id', { count: 'exact', head: true }).eq('owner_id', context.userId),
  ]);
  if (sync.error || versoes.error) throw new Error('Monitoramento indisponível.');
  return { autorizado: true as const, ultima: estado?.sincronizado_em ?? null, erro: estado?.erro ?? null, sincronizando: !!estado?.lease_ate && Date.parse(estado.lease_ate) > Date.now(), clientes: base?.lista.length ?? 0, versoes: versoes.count ?? 0,
    processos: base ? processosDaBase(base).map(p => ({ codigo: Number(p['codigoProcesso']), numero: numeroIdentificadorProcesso(p) ?? 'Identificador pendente', cliente: base.lista.filter(c => base.processos[String(c.codigo)]?.some(x => x['codigoProcesso'] === p['codigoProcesso'])).map(c => c.nomeExibicao ?? c.nome).join(' / '), estado: sync.data.find(s => s.codigo_processo === p['codigoProcesso']) ?? null })) : [] };
});
export const sincronizarProjurisManual = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ codigo: z.number().int().positive().optional() })).handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Sincronização reservada à advogada sênior ou administração.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { sincronizarBase, sincronizarProcesso } = await import('./projuris/base.server');
    if (data.codigo) return sincronizarProcesso(supabaseAdmin, context.userId, data.codigo);
    const b = await sincronizarBase(supabaseAdmin, context.userId);
    return { ok: true as const, novas: b.lista.length, total: b.lista.length };
  });