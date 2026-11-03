import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SaudeAna } from './saude';

/** Painel de saúde da Ana: somente sênior/admin. Lê o último estado gravado pelo agendador e, se pedido, verifica agora. */
export const lerSaudeAna = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: { agora?: boolean } | undefined) => ({ agora: d?.agora === true }))
  .handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) return { autorizado: false as const };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    if (data.agora) { const { verificarESalvar } = await import('./saude.server'); return { autorizado: true as const, saude: await verificarESalvar(supabaseAdmin) }; }
    const r = await supabaseAdmin.from('ana_monitoramento').select('estado').eq('id', 'global').maybeSingle();
    const alertas = await supabaseAdmin.from('audit_log').select('criado_em,resumo,status').eq('acao', 'alertaAna').order('criado_em', { ascending: false }).limit(10);
    return { autorizado: true as const, saude: (r.data?.estado ?? null) as unknown as SaudeAna | null, historico: alertas.data ?? [] };
  });
