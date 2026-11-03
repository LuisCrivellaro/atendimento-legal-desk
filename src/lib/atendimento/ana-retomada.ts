import type { Conversa } from '../mock-data';
import { apenasCumprimentoAna } from './ana-rules';

export const SAUDACAO_RETORNO_ANA='Olá,\n\nSeja bem vindo (a)😊\n\nÀ Equipe CS Advocacia\nwww.carolinasantos.com.br\n\nVou te ajudar!\nNossa primeira consulta é on-line e gratuita.';
/** Same-day inactivity threshold; another São Paulo calendar day always starts a return. */
export const INTERVALO_RETORNO_ANA_MS=4*60*60*1000;
const dia=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function retornoIdentificadoAna(c:Conversa,messageId:string,canal:string,now=new Date()):boolean {
  if(!c.agenteAna?.dados?.nome?.trim()&&!(c.tipoClienteAgenda==='cadastrado'&&c.nome?.trim()))return false;
  const pos=c.mensagens.findIndex(m=>m.id===messageId);
  if(pos<0)return false;
  const anteriores=c.mensagens.slice(0,pos).filter(m=>m.canal===canal&&m.de!=='sistema');
  if(!anteriores.length)return false;
  const stamp=anteriores.at(-1)?.dataHora;
  if(!stamp)return false;
  const anterior=new Date(stamp);
  return Number.isFinite(anterior.getTime())&&now.getTime()>=anterior.getTime()&&(dia(anterior)!==dia(now)||now.getTime()-anterior.getTime()>=INTERVALO_RETORNO_ANA_MS);
}
export function pedidoAgendaRetornoAna(texto:string):boolean {
  return /\b(?:agendar|agendamento|marcar|consulta|hor[aá]rios?|remarcar|reagendar|cancelar|primeir[oa]|segund[oa]|terceir[oa]|[123])\b/i.test(texto);
}
export function mensagemRetornoAna(textoCliente:string,continuacao:string):string {
  if(apenasCumprimentoAna(textoCliente)||!continuacao.trim())return SAUDACAO_RETORNO_ANA;
  const limpa=continuacao.replace(/^(?:Ol[aá]|Oi|Bom dia|Boa tarde|Boa noite)[^\n.!?]*[\n.!?]+\s*/i,'').trim();
  return limpa?`${SAUDACAO_RETORNO_ANA}\n\n${limpa}`:SAUDACAO_RETORNO_ANA;
}