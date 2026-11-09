import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/atendimento/monitorar-ana')({ server: { handlers: { POST: async ({ request }) => {
  const failure = await authenticateCronRequest(request);
  if (failure) return failure;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { verificarESalvar } = await import('@/lib/monitoramento/saude.server');
  try {
    const { donaEntradaWhatsApp } = await import('@/lib/atendimento/entrada-whatsapp.server');
    const dona = await donaEntradaWhatsApp(supabaseAdmin);
    if (dona.ownerId) {
      const { sincronizarNomesWhatsApp } = await import('@/lib/atendimento/nomes-contatos.server');
      try { await sincronizarNomesWhatsApp(supabaseAdmin, dona.ownerId, true); }
      catch { console.error('Atualização automática dos nomes da agenda indisponível; nomes anteriores preservados.'); }
    }
    const s = await verificarESalvar(supabaseAdmin); return Response.json({ geral: s.geral, alertas: s.alertas.length });
  }
  catch (e) { console.error('Monitor da Ana falhou', e); return Response.json({ error: 'Monitor indisponível' }, { status: 503 }); }
} } } });
