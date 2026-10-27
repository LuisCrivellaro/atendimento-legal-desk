import { gerarHorarios, horarioPermitido } from './schedule-rules';
import { intervaloLivre } from './calendar-booking';
import type { TipoCliente } from './intake-rules';

const fold = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function partesAgenda(iso:string) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
}
const dias = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
export function pedidoHumano(texto:string) {
  const t=fold(texto);
  return /(?:falar|conversar|passa\w*|atendimento).{0,65}(?:alguem|pessoa|humano|equipe|advogad|carolina|doutora|\bdra\b|responsavel|atendente)|(?:quero|preciso).{0,20}(?:atendente|responsavel|pessoa de verdade)|(?:pessoa|humano).{0,25}(?:falar|atender)/.test(t);
}
export function bloqueiaAgenda(texto:string,intencao:string) {
  const t=fold(texto).trim();
  return pedidoHumano(texto)||/\bnao\s+(?:quero|desejo|vou|preciso)\s+(?:mais\s+)?(?:agendar|marcar)\b/.test(t)||/^(?:ola|oi|bom dia|boa tarde|boa noite|tudo bem)[!?.,\s]*$/.test(t)||['reclamacao','processo','documento','novo_caso'].includes(intencao);
}
export function escolherHorarioAna(slots:string[],texto:string) {
  const t=fold(texto).trim();
  const numero=t.match(/^(?:(?:a|o|opcao|numero|escolho|quero)(?:\s+(?:a|o|opcao))?\s*)?([1-9])\s*[.!]?$/);
  if(numero)return slots[Number(numero[1])-1];
  const dia=dias.findIndex(d=>new RegExp(`\\b${d}(?:-feira)?\\b`).test(t));
  if(dia>=0&&!/\d/.test(t)) {
    const matches=slots.filter(s=>new Date(`${dataAgenda(s)}T12:00:00Z`).getUTCDay()===dia);
    return matches.length===1?matches[0]:undefined;
  }
  return undefined;
}
export function dataAgenda(iso:string) {const p=partesAgenda(iso);return `${p['year']}-${p['month']}-${p['day']}`;}
const hora=(iso:string)=>{const p=partesAgenda(iso);return `${Number(p['hour'])}h${p['minute']==='00'?'':p['minute']}`;};
export function linhaHorarioAna(iso:string,now=new Date()) {
  const p=partesAgenda(iso), data=dataAgenda(iso);
  const today=dataAgenda(now.toISOString());
  const tomorrow=dataAgenda(new Date(now.getTime()+86400000).toISOString());
  const day=new Date(`${data}T12:00:00Z`).getUTCDay();
  const short=['dom','seg','ter','qua','qui','sex','sáb'][day]??'';
  const date=`${p['day']}/${p['month']}`;
  const label=data===today?`Hoje (${short}, ${date})`:data===tomorrow?`Amanhã (${short}, ${date})`:`${short.charAt(0).toUpperCase()+short.slice(1)}, ${date}`;
  return `${label} · ${hora(iso)} às ${hora(new Date(Date.parse(iso)+30*60000).toISOString())}`;
}
export function listaHorariosAna(slots:string[],now=new Date(),repetida=false) {
  if(!slots.length)return 'Não há horários livres permitidos nos próximos 14 dias. A equipe pode verificar outras datas.';
  return `${repetida?'🗓️ Horários livres:':'🗓️ Horários livres para a consulta online (30 min, horário de Brasília):'}\n${slots.map((s,i)=>`${i+1}. ${linhaHorarioAna(s,now)}`).join('\n')}\nResponda com o número ou me diga outro dia e horário.`;
}
export function pedidoHorarioEspecifico(texto:string,now=new Date()) {
  const t=fold(texto);
  const time=t.match(/\b(?:as\s+)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))\b/);
  if(!time)return undefined;
  const h=Number(time[1]),min=Number(time[2]??time[3]??0);
  if(h>23||min>59)return undefined;
  let date=dataAgenda(now.toISOString());
  const dm=t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/),day=t.match(/\bdia\s+(\d{1,2})\b/);
  if(dm){const p=partesAgenda(now.toISOString());date=`${dm[3]??p['year']}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`;}
  else if(day){const p=partesAgenda(now.toISOString());date=`${p['year']}-${p['month']}-${String(day[1]).padStart(2,'0')}`;}
  else if(t.includes('amanha'))date=dataAgenda(new Date(now.getTime()+86400000).toISOString());
  else if(!t.includes('hoje')){
    const weekday=dias.findIndex(d=>new RegExp(`\\b${d}(?:-feira)?\\b`).test(t));
    if(weekday<0)return undefined;
    const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+(weekday-d.getUTCDay()+7)%7);date=d.toISOString().slice(0,10);
  }
  const iso=`${date}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00-03:00`;
  const parsed=new Date(iso);
  if(!Number.isFinite(parsed.getTime())||dataAgenda(parsed.toISOString())!==date)return undefined;
  return parsed.toISOString();
}
export function horarioEspecificoLivre(iso:string,busy:{start:string;end:string}[],tipo:TipoCliente,now=new Date()) {
  return Date.parse(iso)>now.getTime()&&Date.parse(iso)<now.getTime()+14*86400000&&horarioPermitido(iso,tipo)&&intervaloLivre(busy,iso,new Date(Date.parse(iso)+30*60000).toISOString());
}
export function selecionarOpcoesAna(busy:{start:string;end:string}[],now:Date,tipo:TipoCliente,texto='',anteriores:string[]=[],evitarRepeticao=false) {
  // Inclui o restante de hoje, sem mudar as regras compartilhadas dos atalhos manuais.
  const all=gerarHorarios(busy,new Date(now.getTime()-86400000),tipo,500,15).filter(s=>Date.parse(s)>now.getTime()&&Date.parse(s)<=now.getTime()+14*86400000);
  const t=fold(texto),specific=pedidoHorarioEspecifico(texto,now);
  const periodo=/tarde/.test(t)?'tarde':/manha/.test(t)?'manha':undefined;
  let available=all.filter(s=>(!evitarRepeticao||!anteriores.includes(s))&&(!periodo||(periodo==='tarde'?Number(partesAgenda(s)['hour'])>=13:Number(partesAgenda(s)['hour'])<12)));
  const semPeriodo=!!periodo&&!available.length;
  if(semPeriodo)available=all.filter(s=>!evitarRepeticao||!anteriores.includes(s));
  if(specific)available.sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(specific))-Math.abs(Date.parse(b)-Date.parse(specific)));
  const distinct:string[]=[],dates=new Set<string>();
  for(const s of available){if(!dates.has(dataAgenda(s))){distinct.push(s);dates.add(dataAgenda(s));}if(distinct.length===3)break;}
  for(const s of available){if(distinct.length===3)break;if(!distinct.includes(s))distinct.push(s);}
  return {slots:distinct,semPeriodo};
}