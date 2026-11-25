import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

// Rotina prevista a cada 30 minutos (ver docs/rotinas-agendadas.md): lembretes de coleta e follow-up do vendedor.
export const Route=createFileRoute('/api/public/atendimento/lembretes-atendimento')({server:{handlers:{POST:async({request})=>{
  const failure=await authenticateCronRequest(request);
  if(failure)return failure;
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {enviarLembretesColeta}=await import('@/lib/atendimento/coleta.server');
  const {enviarFollowupsVendedor}=await import('@/lib/atendimento/vendedor.server');
  try{const coleta=await enviarLembretesColeta(supabaseAdmin);return Response.json({coleta,vendedor:await enviarFollowupsVendedor(supabaseAdmin)});}
  catch{return Response.json({error:'Lembretes pendentes'},{status:503});}
}}}});
