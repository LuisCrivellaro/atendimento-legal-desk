import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

// Rotina prevista a cada 5 minutos (ver docs/rotinas-agendadas.md). Só com o segredo da rotina.
export const Route=createFileRoute('/api/public/atendimento/confirmacao-consulta')({server:{handlers:{POST:async({request})=>{
  const failure=await authenticateCronRequest(request);
  if(failure)return failure;
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {enviarConfirmacoesConsulta}=await import('@/lib/atendimento/confirmacao-consulta.server');
  try{return Response.json(await enviarConfirmacoesConsulta(supabaseAdmin));}
  catch{return Response.json({error:'Confirmações pendentes'},{status:503});}
}}}});
