import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

/**
 * Monitor central da Anne (agendamento único, a cada 5 minutos, com `Authorization: Bearer <LOVABLE_CRON_SECRET>`):
 * 1. todas as automações operacionais (agenda do ProJuris, confirmação, lembrete, registro de consultas, notícias
 *    processuais, recuperação, coleta, vendedor, reservas provisórias, relatório) em `executarMonitorOperacional`;
 * 2. nomes da agenda do WhatsApp e saúde da Anne (como antes).
 * As rotas antigas (confirmacao-consulta, lembrete-consulta, lembretes-atendimento, pendencias-processo,
 * recuperar-ana, relatorio-diario) continuam respondendo, mas não precisam mais de agendamento próprio.
 */
export const Route = createFileRoute('/api/public/atendimento/monitorar-ana')({ server: { handlers: { POST: async ({ request }) => {
  const failure = await authenticateCronRequest(request);
  if (failure) return failure;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  let operacional: { ok: boolean; falhas: string[] } | { erro: string };
  try {
    const { executarMonitorOperacional } = await import('@/lib/atendimento/monitor-operacional.server');
    const estado = await executarMonitorOperacional(supabaseAdmin, request);
    operacional = { ok: estado.ok, falhas: estado.historico[0]?.falhas ?? [] };
  } catch (e) {
    console.error('Monitor operacional falhou', e);
    operacional = { erro: 'Monitor operacional indisponível' };
  }
  const { verificarESalvar } = await import('@/lib/monitoramento/saude.server');
  try {
    const { donaEntradaWhatsApp } = await import('@/lib/atendimento/entrada-whatsapp.server');
    const dona = await donaEntradaWhatsApp(supabaseAdmin);
    if (dona.ownerId) {
      const { sincronizarNomesWhatsApp } = await import('@/lib/atendimento/nomes-contatos.server');
      try { await sincronizarNomesWhatsApp(supabaseAdmin, dona.ownerId, true); }
      catch { console.error('Atualização automática dos nomes da agenda indisponível; nomes anteriores preservados.'); }
    }
    const s = await verificarESalvar(supabaseAdmin);
    return Response.json({ geral: s.geral, alertas: s.alertas.length, operacional });
  }
  catch (e) { console.error('Monitor da Ana falhou', e); return Response.json({ error: 'Monitor indisponível', operacional }, { status: 503 }); }
} } } });
