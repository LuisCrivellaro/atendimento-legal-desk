import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/atendimento/monitorar-ana')({ server: { handlers: { POST: async ({ request }) => {
  const failure = await authenticateCronRequest(request);
  if (failure) return failure;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { verificarESalvar } = await import('@/lib/monitoramento/saude.server');
  try { const s = await verificarESalvar(supabaseAdmin); return Response.json({ geral: s.geral, alertas: s.alertas.length }); }
  catch (e) { console.error('Monitor da Ana falhou', e); return Response.json({ error: 'Monitor indisponível' }, { status: 503 }); }
} } } });
