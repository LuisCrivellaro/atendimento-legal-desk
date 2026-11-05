import { z } from 'zod';
import type { AIMode } from '../atendimento';
import { forbiddenTopics, normalized, chosenSlot, formatarHorarioCliente } from '../atendimento';
import { gerarHorarios } from './schedule-rules';
import type { TipoCliente } from './intake-rules';
import { validarTextoEnvio } from './canal-envio';
import { bloqueiaAgenda, pedidoHumano, escolherHorarioAna, listaHorariosAna, pedidoOutrasOpcoesAna, hora, dataAgenda } from './ana-scheduling';

export const anaSchema = z.object({
  acao: z.enum(['enviar', 'rascunho', 'nenhuma']), mensagem: z.string(), motivo_aprovacao: z.string(),
  intencao: z.enum(['duvida_geral','novo_caso','agendamento','processo','consulta_processo','documento','reclamacao','outro']),
  urgente: z.boolean(), encaminhar_humano: z.boolean(),
  dados_coletados: z.object({ nome:z.string(), cpf:z.string(), assunto:z.string(), email:z.string() }),
  proximo_passo: z.string(),
});
export type AnaResult = z.infer<typeof anaSchema>;
export interface AnaState {
  controleHumanoEm?: string;
  envioAna?: { mensagemId: string; texto: string; desde: string } | undefined;
  pedidosProcesso?: import('./consulta-processo').PedidoProcesso[] | undefined;
  aguardandoAssuntoProcesso?: boolean;
  /** Vínculo com a pessoa do ProJuris (gravado pelo servidor; pendente até a equipe confirmar). */
  vinculoProjuris?: import('../projuris/vinculo').VinculoProjuris | undefined;
  aguardandoCpfProcesso?: boolean;
  /** Pergunta de processo guardada enquanto o cadastro é localizado pelo CPF. */
  perguntaProcessoPendente?: string | undefined;
  consultaProcessoEmCurso?: { mensagemId: string; desde: string } | undefined;
  tipoCliente?: TipoCliente | undefined; telefone?: string | undefined;
  apresentado?: boolean; humano?: boolean; urgente?: boolean; motivo?: string; proximoPasso?: string;
  dados?: AnaResult['dados_coletados']; resultado?: AnaResult; erro?: string | undefined; pausa?: boolean;
  horariosTeste?: string[]; consultaTeste?: string | undefined; agendaReal?: boolean;
  horariosApresentados?: string[]; listasHorarios?: number; pedidosOutrasOpcoes?: number;
  confirmacaoCancelamento?: {eventoId:string;inicio:string;contato:string;expira:string} | undefined;
  lembreteConsulta?: {inicio:string;enviadoEm:string;confirmadoEm?:string | undefined} | undefined;
  horarioPendente?: string | undefined; horarioPendenteDesde?: string | undefined;
   reservaCalendar?: import('./calendar-booking').ReservaCalendar | undefined;
  alteracaoConsulta?: import('./appointment-management').AlteracaoConsulta | undefined;
  autorizacaoRemarcacao?: {eventoId:string;inicio:string;contato:string;expira:string} | undefined;
  operacaoConsulta?: {mensagemId:string;eventoId:string;tipo:'cancelar'|'remarcar';desde:string} | undefined;
}
export function horariosTesteAna(now = new Date(), tipo: TipoCliente = 'novo') {
 return gerarHorarios([], now, tipo, 3);
}
export function horariosLivresAna(ocupados: {start:string;end:string}[], now = new Date(), tipo: TipoCliente = 'novo', quantidade = 3) {
 return gerarHorarios(ocupados, now, tipo, quantidade);
}
export function respostaAgendaTeste(texto:string,offered:string[],now=new Date(),real=false,tipo:TipoCliente='novo',repetida=false){
 const selected=escolherHorarioAna(offered,texto)??chosenSlot(offered,texto);
 const slots=real?offered:offered.length?offered:horariosTesteAna(now,tipo);
 if(real&&!slots.length)return {slots,selected:undefined,mensagem:listaHorariosAna([],now,repetida)};
  if(real)return {slots,selected,mensagem:selected?`Vou verificar e reservar ${formatarHorarioCliente(selected)} na agenda.`:listaHorariosAna(slots,now,repetida)};
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
 return result.join('\n').trim();
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
/** A disponibilidade da Ana não depende do expediente da equipe. */
export function priorizarAgendamentoAna(r:AnaResult,texto:string,emAgendamento=false):AnaResult {
  const folded=texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(pedidoOutrasOpcoesAna(texto)&&!pedidoHumano(texto))return {...r,intencao:'agendamento',encaminhar_humano:false};
  if(bloqueiaAgenda(texto,r.intencao))return {...r,intencao:pedidoHumano(texto)?'outro':r.intencao==='agendamento'?'duvida_geral':r.intencao};
  const pedido=/\b(?:quero|gostaria|preciso|podemos|vamos)\b.{0,35}\b(?:agendar|marcar|consulta)\b|\b(?:quais|tem|outros?)\b.{0,25}\bhorarios?\b|\b(?:remarcar|cancelar|reagendar)\b/.test(folded);
  return pedido?{...r,intencao:'agendamento'}:r;
}
/** Saudação oficial ao cliente novo (prompt da Dra. Carolina, 04/11/2026). Texto exato; o nome é pedido só após a escolha. */
export const SAUDACAO_CLIENTE_NOVO = 'Olá , \n\nSeja bem vindo (a)😊\nEquipe CS Advocacia \nwww.carolinasantos.com.br\n\nVou te ajudar!\nNossa primeira consulta é on-line e gratuita.';
export const PERGUNTA_HORARIO_ANA = 'O que fica melhor para você?';
export const PEDIDO_NOME_AGENDA_ANA = 'Ótimo! Para registrar na agenda, qual é o seu nome completo?';
const horaOferta=(iso:string)=>`às ${hora(iso)}`;
/** "Temos horários  às 10h ou às 14h30 " — 1 manhã e 1 tarde, mesmo espaçamento do modelo oficial. */
const SEMANA=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function diaOferta(data:string,hoje:string){
  const d=new Date(`${data}T12:00:00Z`),dm=`${data.slice(8,10)}/${data.slice(5,7)}`,sem=SEMANA[d.getUTCDay()];
  return data===hoje?`hoje (${sem}, ${dm})`:`${sem} (${dm})`;
}
/** Opção A (Dra. Carolina, 04/11/2026): dia em linha; mesmo dia "X às 10h ou às 14h30"; dois dias "X às 15h, ou Y às 10h ou às 17h". */
export function linhaDoisHorariosAna(horarios:string[],now=new Date()) {
  const hoje=dataAgenda(now.toISOString());
  const grupos:{data:string;horas:string[]}[]=[];
  for(const s of horarios.slice(0,3)){const data=dataAgenda(s);const g=grupos.find(x=>x.data===data);if(g)g.horas.push(s);else grupos.push({data,horas:[s]});}
  return `Temos horários ${grupos.map(g=>`${diaOferta(g.data,hoje)} ${g.horas.map(horaOferta).join(' ou ')}`).join(', ou ')}`;
}
export function primeiraMensagemAna(horarios:string[],now=new Date()) {
  return `${SAUDACAO_CLIENTE_NOVO}\n${linhaDoisHorariosAna(horarios,now)}\n\n${PERGUNTA_HORARIO_ANA}`;
}
export function saudacaoInicialAna(texto:string) {
  return texto.startsWith('Olá , \n\nSeja bem vindo (a)😊')||texto.startsWith('Olá,\n\nSeja bem vindo (a)😊');
}
export function pediuNomeInicialAna(texto:string) {
  // Compatível também com a saudação já enviada pela versão anterior.
  return saudacaoInicialAna(texto)||texto.endsWith('nome completo?');
}

export function nomePrimeiroContatoAna(texto:string,anterior:string) {
  if(!pediuNomeInicialAna(anterior)||apenasCumprimentoAna(texto)||pedidoOutrasOpcoesAna(texto)||pedidoHumano(texto))return '';
  const nome=texto.trim().replace(/^(?:sou\s+(?:a|o)\s+|me chamo\s+|meu nome (?:é|e)\s+)/i,'');
  if(/\b(?:quero|preciso|gostaria|consulta|agendar|marcar|horário|horarios|obrigad[oa]|manh[aã]|tarde|sim|ok|pode|qualquer|melhor|prefiro|primeir[oa]|segund[oa])\b/i.test(nome))return '';
  return nome.length<=80&&/^[A-Za-zÀ-ÿ'´`-]+(?:\s+[A-Za-zÀ-ÿ'´`-]+){0,7}$/.test(nome)&&!/^não\b/i.test(nome)?nome:'';
}

/** Mensagem só de cumprimento ("oi", "boa tarde, tudo bem?"), sem pedido. */
export function apenasCumprimentoAna(texto:string):boolean {
  const t=texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
  return t.length>0&&/^(?:(?:ola|oi|oie|opa|alo|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|e ai|eai|como vai|hello|hey|ei)\s*)+$/.test(t);
}

/**
 * Primeiro contato de cliente novo: o servidor envia sempre a saudação oficial exata, uma única vez.
 * Fica como agendamento para que a resposta com o nome dispare a consulta real da agenda.
 */
export function saudacaoClienteNovo(r:AnaResult,_texto:string,o:{apresentado:boolean;tipoCliente?:TipoCliente | undefined;horarios?:string[];agendaReal?:boolean}):AnaResult {
  if(o.apresentado||o.tipoCliente==='cadastrado'||r.acao!=='enviar'||r.encaminhar_humano||r.urgente)return r;
  if(!o.agendaReal||!o.horarios?.length)return {...r,acao:'rascunho',mensagem:'',motivo_aprovacao:'Agenda sem disponibilidade verificada; nenhum horário oferecido.'};
  return {...r,mensagem:primeiraMensagemAna(o.horarios),intencao:'agendamento',proximo_passo:'Aguardar escolha de um dos 2 horários reais oferecidos; pedir o nome completo depois.'};
}

/** Violência doméstica é área de atuação da Dra. Carolina: acolhimento jurídico, nunca encaminhamento genérico nem 190 espontâneo. */
export function violenciaDomesticaAna(texto:string):boolean{
  const t=texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /violencia (?:domestica|familiar)|agressao|me agride|me agrediu|me bate|me bateu|abuso|ameac[ao]|medida protetiva|protetiva|assedio/.test(t);
}
export function riscoImediatoAna(texto:string):boolean{
  const t=texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /(?:neste|nesse) momento|agora mesmo|me ameac|vai me (?:matar|bater|pegar)|risco.{0,15}vida|suicid|me matar/.test(t);
}
const ACOLHIMENTO_VD='Entendi. Vamos verificar os horários disponíveis para você conversar com a Dra. Carolina.';
const ACOLHIMENTO_VD_RISCO='Sinto muito que você esteja passando por isso. Você está em um local seguro agora?\nSe quiser, posso te ajudar a contatar os serviços de emergência ou a rede de proteção. E posso verificar os horários disponíveis para você conversar com a Dra. Carolina.';
/** Frases fora do escopo da Anne: investigação do relato, regras internas da agenda e promessas de encaminhamento/avaliação. */
const FORA_ESCOPO=/(?:est[aá] acontecendo agora|j[aá] aconteceu\?|medida protetiva ou processo|j[aá] tem (?:alguma )?medida|me contar (?:mais|brevemente)|mais detalhes|h[aá] quanto tempo|tem provas|s[oó] [aà]s sextas|clientes? j[aá] cadastrad|encaix|registrad[oa] como urgente|poder[aá] avaliar|encaminhar (?:seu|o seu) caso|para an[aá]lise|entrar[aá] em contato para avaliar|equipe (?:j[aá] )?foi (?:avisada|priorizada))/i;
export function limparForaEscopoAna(msg:string):string{
  if(!FORA_ESCOPO.test(msg))return msg;
  const partes=msg.split(/(?<=[.!?])\s+|\n/).filter(p=>!FORA_ESCOPO.test(p));
  return partes.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function aplicarRegrasAna(r:AnaResult, mode:AIMode, texto:string, proibidos:string[],options:{teste?:boolean;horarios?:string[];ultimaResposta?:string;now?:Date;agendaReal?:boolean;tipoCliente?:TipoCliente | undefined;nome?:string;telefone?:string | undefined;emailPendente?:boolean}={}):AnaResult {
  let result = { ...r, dados_coletados:{...r.dados_coletados} };
  const folded = texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const humano = pedidoHumano(texto)||(r.encaminhar_humano&&r.intencao==='outro'&&!/agendar|marcar|consulta/.test(folded));
  const etico = /honorari|ganhar|chance|vitoria|tenho direito|prescri|recorrer|estrategia|desistir|parte contraria|devo assinar/.test(folded);
  const urgent = /(?:risco.{0,15}vida|suicid|me matar|violencia|ameaca|perigo|citacao|oficial de justica|carta do forum|prazo.{0,25}(?:venc|amanha|hoje)|demitid.{0,30}(?:hoje|ontem|semana)|audiencia.{0,35}(?:hoje|amanha|semana))/.test(folded);
  const prohibited = etico || forbiddenTopics(texto,proibidos).length > 0 || forbiddenTopics(r.mensagem,proibidos).length > 0;
  // Tema delicado pede revisão, não uma tomada humana completa da conversa.
  if(prohibited||r.intencao==='reclamacao')result={...result,acao:'enviar',mensagem:r.intencao==='reclamacao'&&!prohibited?'Sinto muito por isso. Deixei registrado para a equipe olhar com cuidado.':'Entendo. Essa dúvida precisa da avaliação da Dra. Carolina, então vou transferir seu atendimento para a equipe, que te responde por aqui.',encaminhar_humano:prohibited,motivo_aprovacao:prohibited?'':'Questão delicada registrada para avaliação humana; nenhuma orientação jurídica enviada.',proximo_passo:prohibited?'Equipe assume a dúvida jurídica; Ana pausada até devolução.':'Equipe: revisar a questão delicada registrada; Ana continua apenas acolhimento e coleta.'};
  else if(!humano)result.encaminhar_humano=false;
  if(humano){const now=options.now??new Date();const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));const dentro=expedienteAna(now)&&Number(p['hour'])<17;result={...result,acao:'enviar',intencao:'outro',mensagem:`${pedidoHumano(texto)?'Claro! Já passei sua conversa para a equipe.':'Por aqui eu cuido só dos agendamentos, então passei sua conversa para a equipe.'}\n${dentro?'Alguém responsável te responde por aqui ainda hoje.':'Alguém responsável te responde no próximo dia útil, a partir das 8h.'}`,encaminhar_humano:true,motivo_aprovacao:'',proximo_passo:'Equipe assume a conversa; Ana pausada até devolução.'};}
  result.urgente ||= urgent;
  const perigo=/risco.{0,15}vida|suicid|me matar|violencia|ameaca|perigo/.test(folded);
  const testAgenda=options.teste&&r.intencao==='agendamento'&&!prohibited&&!humano&&!bloqueiaAgenda(texto,r.intencao);
  const dadosAgenda = testAgenda && (options.tipoCliente === undefined || !options.nome?.trim()&&!/quais\s+hor[aá]rios|hor[aá]rios\s+(?:livres|dispon[ií]veis)/i.test(texto) || !options.telefone);
  if(testAgenda&&!dadosAgenda){const ag=respostaAgendaTeste(texto,options.horarios??[],options.now,options.agendaReal,options.tipoCliente,/🗓️ (?:Horários livres|Consulta online|Outras opções)/.test(options.ultimaResposta??''));result={...result,acao:'enviar',mensagem:ag.mensagem,encaminhar_humano:false,motivo_aprovacao:'',proximo_passo:options.agendaReal?(ag.selected?'Equipe: confirmar reserva do horário escolhido no Google Calendar.':'Horários livres reais oferecidos pelo Google Calendar.'):'Agenda fictícia de teste; nenhuma reserva real.'};}
  if(dadosAgenda)result={...result,acao:'enviar',mensagem:options.tipoCliente===undefined?'É seu primeiro contato ou você já é cliente do escritório?':!options.nome?.trim()?'Qual é seu nome completo?':'Não consegui identificar o contato da conversa para o agendamento. Deixei a situação registrada para a equipe verificar.',encaminhar_humano:!!options.tipoCliente&&!!options.nome?.trim()&&!options.telefone,motivo_aprovacao:'',proximo_passo:'Coletar carteira, nome e telefone do canal antes de oferecer ou reservar horários.'};
  if(/cpf/i.test(result.mensagem)&&/\?/.test(result.mensagem)){result.mensagem='Para o agendamento não precisamos de CPF. Qual é seu nome completo?';}
  const sensitive = !prohibited&&!humano&&r.intencao!=='reclamacao'&&(['processo'].includes(r.intencao)||r.intencao==='agendamento'&&!testAgenda||/documentos? (?:faltantes|pendentes)/i.test(result.mensagem));
  if (sensitive || validarTextoEnvio(result.mensagem) && result.mensagem.trim()) result = {...result, acao:'rascunho',motivo_aprovacao:r.motivo_aprovacao || 'Revisão da equipe obrigatória; agenda real indisponível.'};
  if(options.emailPendente&&!humano&&!prohibited&&!urgent&&['documento','outro','duvida_geral'].includes(r.intencao)&&!perguntaKey(options.ultimaResposta??'').includes('email'))result={...result,acao:'enviar',mensagem:'Para completar seu cadastro, qual é o seu e-mail? Pode escrevê-lo aqui, sem anexar documento.',motivo_aprovacao:'',intencao:'documento',proximo_passo:'Aguardar e-mail do cliente para cadastro e checklist.'};
  if (mode==='Sugerir' && result.mensagem.trim()) result.acao='rascunho';
  if (mode==='Desligada') result = {...result,acao:'nenhuma',mensagem:''};
  if(!testAgenda&&!humano)result.mensagem=mensagemBreveAna(result.mensagem,options.ultimaResposta);
  // Violência doméstica: a Dra. Carolina atua nesses casos. Acolhimento jurídico com prioridade URGENTE,
  // sem 190 espontâneo e sem encaminhamento genérico; a Anne segue qualificando e a equipe é avisada pela urgência.
  if(violenciaDomesticaAna(texto)&&mode!=='Desligada'){
    result.urgente=true;
    const risco=riscoImediatoAna(texto);
    result.mensagem=limparForaEscopoAna(result.mensagem);
    if(/\b190\b/.test(result.mensagem)||!/hor[aá]rio/i.test(result.mensagem)||risco&&!/local seguro/i.test(result.mensagem))result.mensagem=risco?ACOLHIMENTO_VD_RISCO:ACOLHIMENTO_VD;
    result.encaminhar_humano=false;
    result.proximo_passo=`URGENTE — violência doméstica${risco?' com risco imediato informado':''}: priorizar retorno humano da equipe e da Dra. Carolina. ${result.proximo_passo}`.trim();
    if(mode==='Automática'){result.acao='enviar';result.motivo_aprovacao='';}
  }else if(perigo&&mode!=='Desligada'&&/\b190\b/.test(result.mensagem)){
    // A Anne nunca menciona o 190 espontaneamente, mesmo fora de violência doméstica.
    result.mensagem=result.mensagem.replace(/[^.\n]*\b190\b[^.\n]*\.?/g,'').replace(/\n{3,}/g,'\n\n').trim();
  }
  if(mode!=='Desligada'&&result.mensagem.trim()){const limpa=limparForaEscopoAna(result.mensagem);result.mensagem=limpa||'Entendi. Vamos verificar os horários disponíveis para você conversar com a Dra. Carolina.';}
  if(!result.mensagem.trim())result.acao='nenhuma';
  // Nunca exibir CPF completo, inclusive um CPF recém-coletado.
  result.mensagem = result.mensagem.replace(/📅/g,'🗓️').replace(/\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g, cpf=>`••••••••${cpf.replace(/\D/g,'').slice(-3)}`);
  result.dados_coletados.cpf = '';
  if (result.dados_coletados.cpf && !/^\d{11}$/.test(result.dados_coletados.cpf.replace(/\D/g,''))) result.dados_coletados.cpf='';
  return result;
}
/** Resumo do transbordo exibido no sistema para a Dra. Carolina (não é enviado por WhatsApp). */
export function resumoTransbordoAna(nome:string,telefone:string|undefined,duvida:string) {
  const d=duvida.replace(/\s+/g,' ').trim().slice(0,300);
  return `Resumo para a Dra. Carolina — Nome: ${nome.trim()||'não informado'} · Telefone: ${telefone?.trim()||'não informado'} · Dúvida: ${d||'não informada'}`;
}
