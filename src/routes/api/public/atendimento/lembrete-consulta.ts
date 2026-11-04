import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route=createFileRoute('/api/public/atendimento/lembrete-consulta')({server:{handlers:{POST:async({request})=>{
  const failure=await authenticateCronRequest(request);
  if(failure)return failure;
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {enviarLembretesConsulta}=await import('@/lib/atendimento/lembrete-consulta.server');
  try{return Response.json(await enviarLembretesConsulta(supabaseAdmin));}
  catch{return Response.json({error:'Lembretes pendentes'},{status:503});}
}}}});
