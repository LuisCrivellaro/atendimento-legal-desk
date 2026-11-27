import { dataHoraCurta, needsReply } from './atendimento';

const TEM_FUSO = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
/**
 * Dia (AAAA-MM-DD, horário de São Paulo) de uma data de evento. O valor pode ter sido gravado só com o dia
 * ('2026-11-11'), com dia e hora locais do formulário ('2026-11-11T14:30') ou em ISO com fuso.
 * Sem fuso, o texto já é o horário local: não converter (antes, '2026-11-11' virava 10/11 às 21:00).
 */
export function diaEvento(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(valor) && !TEM_FUSO.test(valor)) return valor.slice(0, 10);
  const d = new Date(valor);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** Data de evento para exibir: "11/11/2026" quando só o dia foi gravado; "11/11/2026 · 14:30" quando há hora. */
export function rotuloEvento(valor: string | undefined): string {
  if (!valor) return '';
  const semFuso = TEM_FUSO.test(valor) ? null : /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(valor);
  if (semFuso) { const [, a, m, d, h, min] = semFuso; return h ? `${d}/${m}/${a} · ${h}:${min}` : `${d}/${m}/${a}`; }
  return dataHoraCurta(valor);
}
import type { Mensagem } from './mock-data';
import type { Movement } from './office';
export interface AssessorCase {tarefasRetorno?:import('./atendimento/ana-contexto').TarefaRetorno[];avisosEquipe?:import('./atendimento/avisos-equipe').AvisoEquipe[];id:string;nome:string;pipeline:number;mine:boolean;prazos:{data:string;texto:string;fatal?:boolean}[];mensagens?:Mensagem[];movements?:Movement[];consultaAgendada?:string|undefined;retornoAgendado?:string|undefined}
export function daysUntil(date:string,today:string){return Math.round((Date.parse(date.slice(0,10)+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);}
export function buildAssessor(cases:AssessorCase[],today:string){
 const deadlines=cases.flatMap(c=>c.prazos.filter(p=>p.fatal).map(p=>({...p,caseId:c.id,client:c.nome,days:daysUntil(p.data,today)}))).sort((a,b)=>a.data.localeCompare(b.data));
 // Audiências e perícias de hoje em diante, em ordem de data (eventos passados continuam em Andamentos).
 const events=cases.flatMap(c=>(c.movements??[]).filter(m=>m.tipo&&m.eventoData&&!m.concluido&&diaEvento(m.eventoData)>=today).map(m=>({...m,client:c.nome,caseId:c.id}))).sort((a,b)=>diaEvento(a.eventoData??'').localeCompare(diaEvento(b.eventoData??''))||(a.eventoData??'').localeCompare(b.eventoData??''));
 const consultations=cases.filter(c=>c.consultaAgendada?.slice(0,10)===today);const returns=cases.filter(c=>c.retornoAgendado&&c.retornoAgendado.slice(0,10)>=today);
 // "Aguardando resposta" conta conversas (não mensagens). O menu lateral usa só as conversas do próprio usuário,
 // as mesmas da lista do Atendimento; a tarefa do Assessor pode ver o escritório inteiro (sênior/admin).
 const waiting=cases.filter(c=>needsReply({mensagens:c.mensagens??[]})).length;const waitingMine=cases.filter(c=>c.mine&&needsReply({mensagens:c.mensagens??[]})).length;const protocols=cases.filter(c=>c.pipeline===6||c.pipeline===7).length;
 const tasks:{id:string;label:string;to:'/andamentos'|'/atendimento'|'/protocolo';urgent:boolean;caseId?:string}[]=[];
 for(const p of deadlines.filter(p=>p.days<=2))tasks.push({id:'fatal-'+p.caseId+p.data,label:`Prazo fatal: ${p.client} · ${p.texto}`,to:'/andamentos',urgent:true,caseId:p.caseId});
 for(const c of cases)for(const p of c.prazos.filter(p=>!p.fatal&&p.data===today))tasks.push({id:c.id+p.texto,label:`Vence hoje: ${c.nome} · ${p.texto}`,to:'/andamentos',urgent:false,caseId:c.id});
 for(const c of cases)for(const t of c.tarefasRetorno??[])if(t.status==='pendente')tasks.push({id:t.id,label:`Retorno pendente: ${c.nome} · ${t.assunto}`,to:'/atendimento',urgent:false,caseId:c.id});
 for(const c of cases)for(const a of c.avisosEquipe??[])if(!a.resolvidoEm)tasks.push({id:`aviso-${c.id}-${a.id}`,label:`${c.nome} · ${a.texto}`,to:'/atendimento',urgent:!!a.prioridade,caseId:c.id});
 for(const c of consultations)tasks.push({id:'consulta-'+c.id,label:`Consulta: ${c.nome} · ${new Date(c.consultaAgendada??'').toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}`,to:'/atendimento',urgent:false});
 if(waiting)tasks.push({id:'waiting',label:`${waiting} ${waiting===1?'conversa aguardando':'conversas aguardando'} resposta`,to:'/atendimento',urgent:false});
 if(protocols)tasks.push({id:'protocol',label:`${protocols} casos aguardando autuação ou protocolo`,to:'/protocolo',urgent:false});
 return {deadlines,events,returns,tasks,metrics:{fatal:deadlines.filter(p=>p.days<=2).length,events:events.length,protocols,audits:cases.filter(c=>c.pipeline===4||c.pipeline===5).length,attendances:consultations.length,returns:returns.length},badges:{'/':deadlines.filter(p=>p.days<=7).length,'/atendimento':waitingMine,'/producao':cases.filter(c=>c.pipeline===2||c.pipeline===3).length,'/auditoria':cases.filter(c=>c.pipeline===4||c.pipeline===5).length,'/protocolo':protocols,'/andamentos':cases.reduce((n,c)=>n+(c.movements??[]).filter(m=>m.nova).length,0)}};
}
