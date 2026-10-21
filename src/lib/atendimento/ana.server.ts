import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { defaultState, type OfficeState } from '../office';
import { defaultAutomations, newMessage } from '../atendimento';
import { aplicarRegrasAna, expedienteAna, mensagemSemResposta, type AnaState } from './ana-rules';
type Db=SupabaseClient<Database>;

/** CAS: não substitui mensagens ou edições recebidas durante a geração. */
export async function atualizarConversa(db:Db,id:string,fn:(c:Conversa)=>Conversa) {
  for(let attempt=0;attempt<5;attempt++) {
    const row=await db.from('casos').select('dados,updated_at').eq('id',id).single();
    if(row.error)throw new Error('Conversa indisponível.');
    const next=fn(row.data.dados as unknown as Conversa);
    const result=await db.from('casos').update({dados:JSON.parse(JSON.stringify(next)) as Json,updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',row.data.updated_at).select('id');
    if(result.error)throw new Error('Não foi possível salvar o atendimento.');
    if(result.data?.length)return next;
  }
  throw new Error('Conversa alterada simultaneamente; confira o atendimento.');
}

export async function processarAna(db:Db,id:string,messageId:string,request:Request) {
  const [row,config]=await Promise.all([db.from('casos').select('owner_id,dados').eq('id',id).single(),db.from('atendimento_canal_config').select('*').eq('id',true).single()]);
  if(row.error||config.error||!config.data.agente_ativo||config.data.canal_ativo!=='telegram')return;
  const c=row.data.dados as unknown as Conversa;
  const ws=await db.from('office_workspace').select('dados').eq('owner_id',row.data.owner_id).maybeSingle();
  if(ws.error)throw new Error('Treinamento indisponível.');
  const state=(ws.data?.dados as unknown as OfficeState)??defaultState;
  const mode=c.modoIA??state.automations?.modoIA??defaultAutomations.modoIA;
  const m=c.mensagens.find(m=>m.id===messageId);
  if(!m||m.iaProcessada||c.agenteAna?.humano||c.agenteAna?.pausa||state.anaPausa?.ativa)return;
  let claimed=false;
  await atualizarConversa(db,id,current=>{
    claimed=false;
    const target=current.mensagens.find(m=>m.id===messageId);
    if(!target||target.iaProcessada||current.agenteAna?.humano||current.agenteAna?.pausa)return current;
    claimed=true;
    return {...current,mensagens:current.mensagens.map(m=>m.id===messageId?{...m,iaProcessada:true}:m)};
  });
  if(!claimed||mensagemSemResposta(m.texto,!!m.arquivo))return;
  try {
    const {gerarRespostaAna}=await import('./ana.functions');
    // Histórico exclusivamente deste contato/canal; nunca material jurídico do caso demonstrativo.
    const history=c.mensagens.filter(m=>m.canal==='telegram').slice(-24).map(m=>({de:m.de,texto:m.texto,arquivo:m.arquivo??'',autor:m.autor??''}));
    const raw=await gerarRespostaAna(request,{data_hora_atual:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),dentro_expediente:expedienteAna(),modo_ia:mode,vendedor_ativo:state.automations?.vendedor??false,cliente:c.agenteAna?.dados??null,apresentado:c.agenteAna?.apresentado??false,consulta_info:'Não informado: consultar equipe.',temas_proibidos_extra:state.training.proibidos,historico:history,ultima_mensagem:{texto:m.texto,arquivo:m.arquivo??''},exemplos:state.training.exemplos},state.training.instrucoes);
    const r=aplicarRegrasAna(raw,mode,m.texto,state.training.proibidos);
    await atualizarConversa(db,id,current=>({...current,agenteAna:{...current.agenteAna,resultado:r,dados:{...(current.agenteAna?.dados??{nome:'',cpf:'',assunto:'',email:''}),...Object.fromEntries(Object.entries(r.dados_coletados).filter(([,v])=>v))},humano:r.encaminhar_humano,urgente:r.urgente,motivo:r.motivo_aprovacao,proximoPasso:r.proximo_passo,erro:undefined},iaRetida:r.acao==='rascunho'?r.mensagem:current.iaRetida}));
    if(r.acao==='enviar'&&r.mensagem.trim()) {
      // Relê bloqueios imediatamente antes de enviar; alteração de modo/canal vence a geração.
      const [fresh,cfg,contact]=await Promise.all([db.from('casos').select('dados').eq('id',id).single(),db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id',true).single(),db.from('atendimento_contatos_teste').select('contato_externo,status').eq('conversa_id',id).eq('canal','telegram').eq('status','liberado').maybeSingle()]);
      const current=fresh.data?.dados as unknown as Conversa|undefined;
      if(fresh.error||cfg.error||contact.error||!contact.data||!current||cfg.data.canal_ativo!=='telegram'||!cfg.data.agente_ativo||(current.modoIA??mode)!=='Automática'||current.mensagens.some(x=>x.respostaAnaDe===messageId))return;
      // Claim persistente antes do envio impede replay em falha de rede; nunca reenvia automaticamente.
      const {enviarMensagemSistema}=await import('./envio.functions');
      const sent=await enviarMensagemSistema({supabase:db,conversaId:id,texto:r.mensagem,motivo:'ana'});
      if(sent.simulado)throw new Error('Canal desligado; resposta não enviada.');
      await atualizarConversa(db,id,current=>({...current,iaRetida:undefined,agenteAna:{...current.agenteAna,apresentado:true},mensagens:[...current.mensagens,newMessage(r.mensagem,{autor:'Ana · assistente virtual',canal:'telegram',idExterno:sent.idExterno,respostaAnaDe:messageId})]}));
    }
    const audit=await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'agenteAna',p_resumo:`${mode} · ${r.acao} · ${r.intencao}${r.urgente?' · urgente':''}`,p_status:'sucesso'});
    if(audit.error)throw new Error('Falha ao registrar auditoria.');
  } catch(error) {
    const e=error as {statusCode?:number;responseBody?:string;message?:string};
    let safe='Não foi possível concluir a resposta da Ana; atendimento encaminhado para a equipe.';
    try {const body=JSON.parse(e.responseBody??'{}');safe=body.message??body.error?.message??safe;}catch {/* Não exibir corpo bruto. */}
    safe=safe.slice(0,400);
    const pause=e.statusCode===402||e.statusCode===403||e.statusCode===404||e.statusCode===401;
    if(pause) {
      // Pausa durável para todos os atendimentos do proprietário. Sem probes/retries.
      const latest=await db.from('office_workspace').select('dados,updated_at').eq('owner_id',row.data.owner_id).maybeSingle();
      if(latest.error)throw new Error('Não foi possível salvar a pausa da IA.');
      const next={...((latest.data?.dados as unknown as OfficeState)??defaultState),anaPausa:{ativa:true,motivo:safe}};
      const save=latest.data?await db.from('office_workspace').update({dados:next as unknown as Json}).eq('owner_id',row.data.owner_id).eq('updated_at',latest.data.updated_at).select('owner_id'):await db.from('office_workspace').insert({owner_id:row.data.owner_id,dados:next as unknown as Json}).select('owner_id');
      if(save.error||!save.data?.length)throw new Error('Não foi possível salvar a pausa da IA.');
    }
    await atualizarConversa(db,id,current=>({...current,agenteAna:{...current.agenteAna,humano:true,pausa:pause,erro:safe,proximoPasso:'Equipe: conferir falha da Ana antes de retomar.'}}));
    await db.rpc('registrar_audit_log',{p_ator:'Ana',p_perfil:'sistema',p_acao:'agenteAna',p_resumo:'Resposta interrompida · atendimento humano',p_status:'erro',p_erro:safe});
  }
}