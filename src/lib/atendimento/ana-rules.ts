import { z } from 'zod';
import type { AIMode } from '../atendimento';
import { forbiddenTopics, normalized, chosenSlot, formatarHorarioCliente } from '../atendimento';
import { gerarHorarios } from './schedule-rules';
import type { TipoCliente } from './intake-rules';
import { validarTextoEnvio } from './canal-envio';

export const anaSchema = z.object({
  acao: z.enum(['enviar', 'rascunho', 'nenhuma']), mensagem: z.string(), motivo_aprovacao: z.string(),
  intencao: z.enum(['duvida_geral','novo_caso','agendamento','processo','documento','reclamacao','outro']),
  urgente: z.boolean(), encaminhar_humano: z.boolean(),
  dados_coletados: z.object({ nome:z.string(), cpf:z.string(), assunto:z.string(), email:z.string() }),
  proximo_passo: z.string(),
});
export type AnaResult = z.infer<typeof anaSchema>;
export interface AnaState {
  tipoCliente?: TipoCliente | undefined; telefone?: string | undefined;
  apresentado?: boolean; humano?: boolean; urgente?: boolean; motivo?: string; proximoPasso?: string;
  dados?: AnaResult['dados_coletados']; resultado?: AnaResult; erro?: string | undefined; pausa?: boolean;
  horariosTeste?: string[]; consultaTeste?: string | undefined; agendaReal?: boolean;
   reservaCalendar?: import('./calendar-booking').ReservaCalendar;
}
export function horariosTesteAna(now = new Date(), tipo: TipoCliente = 'novo') {
 return gerarHorarios([], now, tipo, 3);
}
export function horariosLivresAna(ocupados: {start:string;end:string}[], now = new Date(), tipo: TipoCliente = 'novo', quantidade = 3) {
 return gerarHorarios(ocupados, now, tipo, quantidade);
}
export function respostaAgendaTeste(texto:string,offered:string[],now=new Date(),real=false,tipo:TipoCliente='novo'){
 const selected=chosenSlot(offered,texto);
 const slots=real?offered:offered.length?offered:horariosTesteAna(now,tipo);
 if(real&&!slots.length)return {slots,selected:undefined,mensagem:'Não há horários livres permitidos nos próximos 14 dias. Deixei o pedido para a equipe verificar outras datas.'};
  if(real)return {slots,selected,mensagem:selected?`Vou verificar e reservar ${formatarHorarioCliente(selected)} na agenda.`:`Tenho estes horários livres na agenda:\n${slots.map(s=>`• ${formatarHorarioCliente(s)}`).join('\n')}\nQual prefere?`};
 return {slots,selected,mensagem:selected?`Para este teste, ficou combinado ${formatarHorarioCliente(selected)}. É uma simulação: não há reserva real no Google Calendar.`:`Podemos simular estes horários:\n${slots.map(s=>`• ${formatarHorarioCliente(s)}`).join('\n')}\nQual prefere? São horários fictícios de teste, sem reserva real.`};
}
function perguntaKey(s:string){
 const n=normalized(s);
 if(/(?:qual|informe|diga|pode).*(?:nome)|comosechama/.test(n))return 'nome';
 if(n.includes('cpf'))return 'cpf';
 if(n.includes('email'))return 'email';
 if(/assunto|comopossoajudar|como.*ajudar|oqueaconteceu/.test(n))return 'assunto';
 return n;
}
export function mensagemBreveAna(texto:string,ultimaResposta=''){
 texto=texto.replace(/\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g,cpf=>`••••••••${cpf.replace(/\D/g,'').slice(-3)}`);
 const previous=(ultimaResposta.match(/[^.!?\n]+\?/g)??[]).map(perguntaKey);
 let question=false;
 const sentences=texto.match(/[^.!?\n]+[.!?]?/g)??[];
 const kept=sentences.map(s=>s.trim()).filter(Boolean).filter(s=>{
  if(!s.endsWith('?'))return true;
  if(question||previous.includes(perguntaKey(s)))return false;
  question=true;return true;
 });
 const result:string[]=[];let length=0;
 for(const s of kept){if(length+s.length>420)break;result.push(s);length+=s.length+1;}
 return result.join(' ').trim();
}
export function aceitarRespostaAna(messageId:string,lastId:string|undefined,state:AnaState|undefined){
  return lastId===messageId&&!state?.humano&&!state?.pausa;
}
export function expedienteAna(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/Sao_Paulo', weekday:'short', hour:'numeric', hourCycle:'h23' }).formatToParts(now);
  const weekday = parts.find(p=>p.type==='weekday')?.value;
  const hour = Number(parts.find(p=>p.type==='hour')?.value);
  return weekday !== 'Sat' && weekday !== 'Sun' && hour >= 8 && hour < 18;
}
export function mensagemSemResposta(texto: string, arquivo = false) {
  return !arquivo && ['', 'ok','obrigado','obrigada','recebi','beleza','certo','perfeito','combinado'].includes(normalized(texto));
}
export function aplicarRegrasAna(r:AnaResult, mode:AIMode, texto:string, proibidos:string[],options:{teste?:boolean;horarios?:string[];ultimaResposta?:string;now?:Date;agendaReal?:boolean;tipoCliente?:TipoCliente | undefined;nome?:string;telefone?:string | undefined}={}):AnaResult {
  let result = { ...r, dados_coletados:{...r.dados_coletados} };
  const folded = texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const humano = /(?:falar|conversar|atendimento).{0,35}(?:pessoa|humano|equipe|advogad|carolina)|(?:pessoa|humano).{0,25}(?:falar|atender)/.test(folded);
  const etico = /honorari|ganhar|chance|vitoria|tenho direito|prescri|recorrer|estrategia|desistir|parte contraria|devo assinar/.test(folded);
  const urgent = /(?:risco.{0,15}vida|suicid|me matar|violencia|ameaca|perigo|citacao|oficial de justica|carta do forum|prazo.{0,25}(?:venc|amanha|hoje)|demitid.{0,30}(?:hoje|ontem|semana)|audiencia.{0,35}(?:hoje|amanha|semana))/.test(folded);
  const prohibited = etico || forbiddenTopics(texto,proibidos).length > 0 || forbiddenTopics(r.mensagem,proibidos).length > 0;
  // Tema delicado pede revisão, não uma tomada humana completa da conversa.
  if(prohibited||r.intencao==='reclamacao')result={...result,acao:'enviar',mensagem:'Entendo. Deixei essa questão registrada para a equipe avaliar com cuidado. Posso continuar anotando as informações do seu atendimento.',encaminhar_humano:false,motivo_aprovacao:'Questão delicada registrada para avaliação humana; nenhuma orientação jurídica enviada.',proximo_passo:'Equipe: revisar a questão delicada registrada; Ana continua apenas acolhimento e coleta.'};
  else if(!humano)result.encaminhar_humano=false;
  if(humano)result={...result,acao:'enviar',mensagem:'Claro. Seu pedido ficou registrado para a equipe continuar o atendimento.',encaminhar_humano:true};
  result.urgente ||= urgent;
  const perigo=/risco.{0,15}vida|suicid|me matar|violencia|ameaca|perigo/.test(folded);
  const testAgenda=options.teste&&r.intencao==='agendamento'&&!prohibited&&!humano;
  const dadosAgenda = testAgenda && (options.tipoCliente === undefined || !options.nome?.trim() || !options.telefone);
  if(testAgenda&&!dadosAgenda){const ag=respostaAgendaTeste(texto,options.horarios??[],options.now,options.agendaReal,options.tipoCliente);result={...result,acao:'enviar',mensagem:ag.mensagem,encaminhar_humano:false,motivo_aprovacao:'',proximo_passo:options.agendaReal?(ag.selected?'Equipe: confirmar reserva do horário escolhido no Google Calendar.':'Horários livres reais oferecidos pelo Google Calendar.'):'Agenda fictícia de teste; nenhuma reserva real.'};}
  if(dadosAgenda)result={...result,acao:'enviar',mensagem:options.tipoCliente===undefined?'É seu primeiro contato ou você já é cliente do escritório?':!options.nome?.trim()?'Qual é seu nome completo?':'Qual é seu telefone com DDD para registrar a consulta?',encaminhar_humano:false,motivo_aprovacao:'',proximo_passo:'Coletar carteira, nome e telefone antes de oferecer ou reservar horários.'};
  if(/cpf/i.test(result.mensagem)&&/\?/.test(result.mensagem)){result.mensagem='Para o agendamento não precisamos de CPF. Qual é seu nome completo?';}
  const sensitive = !prohibited&&!humano&&r.intencao!=='reclamacao'&&(['processo'].includes(r.intencao)||r.intencao==='agendamento'&&!testAgenda||/documentos? (?:faltantes|pendentes)/i.test(result.mensagem));
  if (sensitive || validarTextoEnvio(result.mensagem) && result.mensagem.trim()) result = {...result, acao:'rascunho',motivo_aprovacao:r.motivo_aprovacao || 'Revisão da equipe obrigatória; agenda real indisponível.'};
  if (mode==='Sugerir' && result.mensagem.trim()) result.acao='rascunho';
  if (mode==='Desligada') result = {...result,acao:'nenhuma',mensagem:''};
  if(!testAgenda)result.mensagem=mensagemBreveAna(result.mensagem,options.ultimaResposta);
  if(perigo&&mode!=='Desligada'&&!result.mensagem.includes('190'))result.mensagem=mensagemBreveAna(`Se houver perigo imediato, ligue 190. ${result.mensagem}`,options.ultimaResposta);
  if(!result.mensagem.trim())result.acao='nenhuma';
  // Nunca exibir CPF completo, inclusive um CPF recém-coletado.
  result.mensagem = result.mensagem.replace(/\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g, cpf=>`••••••••${cpf.replace(/\D/g,'').slice(-3)}`);
  result.dados_coletados.cpf = '';
  if (result.dados_coletados.cpf && !/^\d{11}$/.test(result.dados_coletados.cpf.replace(/\D/g,''))) result.dados_coletados.cpf='';
  return result;
}