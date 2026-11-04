import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/atendimento/relatorio-diario')({ server: { handlers: { POST: async ({ request }) => {
  const failure = await authenticateCronRequest(request);
  if (failure) return failure;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { enviarRelatorioDiario } = await import('@/lib/atendimento/relatorio-diario.server');
  try { return Response.json(await enviarRelatorioDiario(supabaseAdmin)); }
  catch { return Response.json({ error: 'Relatório pendente' }, { status: 503 }); }
} } } });
