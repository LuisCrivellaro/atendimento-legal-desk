import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const controlarAnaConversa=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({conversaId:z.string().uuid(),estado:z.enum(['ativa','humana','pausada'])})).handler(async({data,context})=>{
  const row=await context.supabase.from('casos').select('owner_id').eq('id',data.conversaId).single();
  if(row.error||row.data.owner_id!==context.userId)throw new Error('Conversa indisponível para esta conta.');
  const {atualizarConversa}=await import('./ana.server');
  await atualizarConversa(context.supabase,data.conversaId,c=>({...c,modoIA:data.estado==='ativa'?'Automática':c.modoIA,agenteAna:{...c.agenteAna,humano:data.estado==='humana',pausa:data.estado==='pausada',controleHumanoEm:new Date().toISOString(),erro:undefined,proximoPasso:data.estado==='ativa'?'Ana reativada explicitamente pela equipe.':data.estado==='humana'?'Equipe assumiu a conversa; Ana não responde.':'Ana pausada nesta conversa.'}}));
  const audit=await context.supabase.rpc('registrar_audit_log',{p_ator:context.userId,p_perfil:'equipe',p_acao:'controleAnaConversa',p_resumo:`Estado: ${data.estado}`,p_status:'sucesso'});
  if(audit.error)throw new Error('Estado salvo; auditoria pendente. Atualize a conversa.');
  return {ok:true};
});