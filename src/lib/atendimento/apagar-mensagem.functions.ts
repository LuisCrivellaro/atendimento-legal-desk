import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {Conversa} from '../mock-data';
import {mensagemDoAgente,podeApagarParaTodos} from './apagar-mensagem';

export const apagarMensagemAgente=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({conversaId:z.string().uuid(),mensagemId:z.string().min(1).max(300),paraTodos:z.boolean()}))
 .handler(async({data,context})=>{
  const db=context.supabase;
  const row=await db.from('casos').select('owner_id,dados').eq('id',data.conversaId).eq('owner_id',context.userId).single();
  if(row.error||!row.data)throw new Error('Conversa indisponível para esta conta.');
  const c=row.data.dados as unknown as Conversa;
  const m=c.mensagens.find(m=>m.id===data.mensagemId);
  if(!m||!mensagemDoAgente(m))throw new Error('Esta opção só apaga mensagens enviadas pelo agente.');
  if(data.paraTodos){
   const roles=await db.from('user_roles').select('role').eq('user_id',context.userId);
   if(roles.error||!roles.data?.some(r=>r.role==='advogada_senior'||r.role==='admin'))throw new Error('Somente a advogada sênior ou administrador pode apagar para todos.');
   if(m.apagadaParaTodos)return {ok:true};
   if(!podeApagarParaTodos(m))throw new Error('Esta mensagem não tem envio WhatsApp verificável.');
   const contact=await db.from('atendimento_contatos_teste').select('contato_externo').eq('conversa_id',data.conversaId).eq('canal','ultramsg').eq('status','liberado').single();
   if(contact.error||!contact.data)throw new Error('Contato da conversa indisponível.');
   const {apagarNoWhatsApp}=await import('./apagar-mensagem.server');
   await apagarNoWhatsApp(m,contact.data.contato_externo,{instancia:process.env['ULTRAMSG_INSTANCE_ID']??'',token:process.env['ULTRAMSG_TOKEN']??''});
  }
  const {atualizarConversa}=await import('./ana.server');
  const em=new Date().toISOString();
  await atualizarConversa(db,data.conversaId,current=>({...current,mensagens:current.mensagens.map(x=>x.id!==m.id?x:data.paraTodos?{...x,apagadaParaTodos:{em,por:context.userId}}:{...x,ocultaPara:[...new Set([...(x.ocultaPara??[]),context.userId])]}),timeline:[...current.timeline,{data:em,evento:data.paraTodos?'Mensagem da Ana apagada no WhatsApp por confirmação do provedor.':'Mensagem da Ana ocultada para a conta atual.'}]}));
  await db.rpc('registrar_audit_log',{p_ator:context.userId,p_perfil:'equipe',p_acao:'apagarMensagemAna',p_resumo:`${data.paraTodos?'WhatsApp':'Apenas esta conta'} · ${data.mensagemId}`,p_status:'sucesso'});
  return {ok:true};
 });