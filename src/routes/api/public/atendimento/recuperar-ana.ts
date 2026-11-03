import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route=createFileRoute('/api/public/atendimento/recuperar-ana')({server:{handlers:{POST:async({request})=>{
  const failure=await authenticateCronRequest(request);
  if(failure)return failure;
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {recuperarAna}=await import('@/lib/atendimento/ana-recovery.server');
  try{return Response.json(await recuperarAna(supabaseAdmin,request));}
  catch{return Response.json({error:'Recuperação pendente'},{status:503});}
}}}});