import type { Conversa, Mensagem } from './mock-data';
export type AIMode = 'Desligada' | 'Sugerir' | 'Automática';
export interface AutomationSettings { identificarDocumentos:boolean; criarPasta:boolean; pedirDocumentos:boolean; lembreteContrato:boolean; lembreteFaltantes:boolean; lembreteConsulta:boolean; foraHorario:boolean; vendedor:boolean; modoIA:AIMode }
export const defaultAutomations:AutomationSettings={identificarDocumentos:true,criarPasta:true,pedirDocumentos:true,lembreteContrato:true,lembreteFaltantes:true,lembreteConsulta:true,foraHorario:false,vendedor:false,modoIA:'Sugerir'};
export function normalized(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
export function needsReply(c:Pick<Conversa,'mensagens'>){const m=c.mensagens.at(-1);return Boolean(m?.de==='cliente'&&(m.arquivo||!['ok','obrigado','obrigada','recebi','beleza','certo','perfeito','combinado'].includes(normalized(m.texto))));}
export function unread(c:Pick<Conversa,'mensagens'|'lidoAte'>){return c.mensagens.filter(m=>m.de==='cliente'&&m.dataHora&&(!c.lidoAte||m.dataHora>c.lidoAte)).length;}
export function waitingMinutes(c:Pick<Conversa,'mensagens'>,now=new Date()){const t=c.mensagens.at(-1)?.dataHora;return t?Math.max(0,(now.getTime()-Date.parse(t))/60000):null;}
export function waitTone(minutes:number|null){return minutes===null?'muted':minutes<=60?'primary':minutes<=240?'pending':'destructive';}
export function replyQueue(cases:Conversa[]){return cases.filter(needsReply).sort((a,b)=>(a.mensagens.at(-1)?.dataHora??'').localeCompare(b.mensagens.at(-1)?.dataHora??''));}
export function matchesConversation(c:Conversa,s:string){return [c.nome,c.telefone,c.cpf].some(v=>normalized(v).includes(normalized(s)));}
export function forbiddenTopics(text:string,topics:string[]){return topics.filter(t=>t.trim()&&normalized(text).includes(normalized(t)));}
export type StepAction='revisar'|'confirmar'|'lembrete'|'contrato'|'video'|'horarios'|'faltantes'|'producao'|'ia';
export function nextStep(c:Conversa):{title:string;reason:string;action?:StepAction}{
 if(c.iaRetida)return {title:'Revisar IA',reason:'Resposta automática retida por tema proibido.',action:'revisar'};
 const m=c.mensagens.at(-1);const chosen=c.horariosOfertados?.find(h=>m?.de==='cliente'&&m.texto.includes(h));
 if(chosen&&!c.consultaAgendada)return {title:'Confirmar consulta',reason:`Cliente escolheu ${chosen}.`,action:'confirmar'};
 if(c.contrato==='enviado'||c.contrato==='visualizado')return {title:'Lembrar assinatura',reason:'Contrato ainda não assinado.',action:'lembrete'};
 if(c.consulta&&!c.contrato)return {title:'Gerar contrato',reason:'Consulta realizada, contrato não gerado.',action:'contrato'};
 if(c.consultaAgendada&&!c.consulta)return {title:'Iniciar videochamada',reason:`Consulta marcada para ${c.consultaAgendada}.`,action:'video'};
 if(c.horariosOfertados?.length&&!c.consultaAgendada)return {title:'Aguardar escolha de horário',reason:'Horários enviados ao cliente.'};
 if(!c.consulta&&!c.consultaAgendada)return {title:'Enviar horários',reason:'Consulta ainda não marcada.',action:'horarios'};
 if(c.documentos.some(d=>!d.recebido))return {title:'Pedir documentos faltantes',reason:'Há itens pendentes no checklist.',action:'faltantes'};
 if(c.etapa!=='ativo'&&c.documentos.length&&c.documentos.every(d=>d.recebido))return {title:'Pode seguir para a Produção',reason:'Checklist completo; aprovação jurídica continua obrigatória.',action:'producao'};
 if(c.etapa==='ativo'&&needsReply(c))return {title:'Sugerir resposta',reason:'Cliente ativo aguarda atendimento.',action:'ia'};
 return {title:'Nada pendente',reason:'Nenhuma ação operacional imediata.'};
}
export interface FreeSlot {iso:string; label:string; ocupado:boolean}
export function freeSlots(now=new Date(),friday=false):FreeSlot[]{const rows:FreeSlot[]=[];const d=new Date(now);let days=0;while(days<3){d.setDate(d.getDate()+1);if(friday?d.getDay()!==5:d.getDay()===0||d.getDay()===6)continue;days++;for(const time of friday?['14:00','14:20','14:40','15:00','15:20','15:40','16:00','16:20']:['09:00','10:30','14:00']){const [h,m]=time.split(':').map(Number);const date=new Date(d);date.setHours(h??0,m??0,0,0);rows.push({iso:date.toISOString(),label:date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),ocupado:!friday&&time==='14:00'});}}return rows;}
export function validOffer(slots:FreeSlot[]){if(slots.some(s=>s.ocupado))return false;const days=new Map<string,number>();for(const s of slots){const day=s.iso.slice(0,10);days.set(day,(days.get(day)??0)+1);}return days.size>=2&&days.size<=3&&[...days.values()].every(n=>n===2);}
export function validReturn(iso:string,duration:number){const d=new Date(iso);return d.getDay()===5&&d.getHours()>=14&&d.getHours()<18&&d.getMinutes()%20===0&&[15,20].includes(duration);}
export const shortcuts=[['ola','Olá, {nome}! Aqui é a assessora da Dra. Carolina Santos.'],['horarios',''],['docs',''],['faltantes',''],['retorno',''],['contrato',''],['recebido','Recebemos seu documento, {nome}. Vamos conferir o conteúdo.'],['andamento','{nome}, vou consultar o andamento do seu processo.'],['verificar','{nome}, vou verificar com a advogada responsável.'],['obrigada','Obrigada, {nome}! Estamos à disposição.']] as const;
export function programmed(c:Conversa,a:AutomationSettings){const jobs:{key:string;when:string;title:string}[]=[];const append=(key:string,start:string|undefined,hours:number,title:string)=>{if(start)jobs.push({key,when:new Date(Date.parse(start)+hours*3600000).toISOString(),title});};if(a.lembreteContrato&&['enviado','visualizado'].includes(c.contrato??''))append('contrato',c.contratoEnviadoEm,24,'Lembrete do contrato');if(a.lembreteFaltantes&&c.etapa==='documentos'&&c.documentos.some(d=>!d.recebido))append('faltantes',c.ultimoPedidoDocumentos,48,'Lembrete dos documentos faltantes');if(a.lembreteConsulta)append('consulta',c.consultaAgendada,-1,'Lembrete da consulta');return jobs;}
export function newMessage(text:string,extra:Partial<Mensagem>={}):Mensagem{const now=new Date();return {id:crypto.randomUUID(),de:'escritorio',texto:text,hora:now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),dataHora:now.toISOString(),...extra};}
