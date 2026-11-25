import { gerarHorarios, horarioPermitido, feriadoNacional, ANTECEDENCIA_MINIMA_MS } from './schedule-rules';
import { intervaloLivre } from './calendar-booking';
import type { TipoCliente } from './intake-rules';
import { formatarHorarioCliente } from '../atendimento';

const fold = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function partesAgenda(iso:string) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
}
const dias = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
export function pedidoHumano(texto:string) {
  const t=fold(texto);
  return /pessoa de verdade|(?:falar|conversar|passa\w*|atendimento).{0,65}(?:alguem|pessoa|humano|equipe|advogad|carolina|doutora|\bdra\b|responsavel|atendente)|(?:quero|preciso).{0,20}(?:atendente|responsavel|pessoa de verdade)|(?:pessoa|humano).{0,25}(?:falar|atender)/.test(t);
}
export function bloqueiaAgenda(texto:string,intencao:string) {
  const t=fold(texto).trim();
  return pedidoHumano(texto)||/\bnao\s+(?:quero|desejo|vou|preciso)\s+(?:mais\s+)?(?:agendar|marcar)\b/.test(t)||/^(?:ola|oi|bom dia|boa tarde|boa noite|tudo bem)[!?.,\s]*$/.test(t)||(['reclamacao','processo','documento','novo_caso'].includes(intencao)&&!pedidoOutrasOpcoesAna(texto));
}
/** Normaliza escolhas digitadas às pressas: "As9:30" → "as 9:30", "9.30"/"9 e meia" → "9:30", "9hs" → "9h". */
export function normalizarEscolhaHorario(texto:string) {
  return fold(texto).trim().replace(/\b(\d{1,2})\s*[vjg]\s*(\d{2})\b/g,'$1h$2').replace(/([a-gi-z])(\d)/g,'$1 $2').replace(/\b(\d{1,2})\s*horas?\b/g,'$1h').replace(/\b(as|pode ser|prefiro|quero|fico com)\s+(\d{1,2})(?![\d:h.,\/])\b/g,'$1 $2h').replace(/\b(\d{1,2})\s*(?:h|:)?\s*e\s+meia\b/g,'$1:30').replace(/\b(\d{1,2})[.,](\d{2})\b/g,'$1:$2').replace(/\b(\d{1,2})\s*hs?\b/g,'$1h').replace(/\b(\d{1,2})h\s+(\d{2})\b/g,'$1h$2').replace(/\s+/g,' ');
}
export function escolherHorarioAna(slots:string[],texto:string) {
  const t=normalizarEscolhaHorario(texto);
  // Oferta oficial: um horário de manhã e um à tarde; "de manhã"/"à tarde" escolhe o respectivo.
  const per=t.match(/^(?:(?:o|a|pode ser|prefiro|quero|fico com|melhor)\s+)*(?:(?:de|da|a|pela|na|o da|o de)\s+)?(manha|tarde)[.!\s]*$/);
  if(per){const m=slots.filter(s=>per[1]==='manha'?Number(partesAgenda(s)['hour'])<12:Number(partesAgenda(s)['hour'])>=12);return m.length===1?m[0]:undefined;}
  if(pedidoOutrasOpcoesAna(texto)||/\?|\b(?:tem|livre|disponivel)\b/.test(t))return undefined;
  // Data/horário explícitos têm prioridade sobre a posição na lista: "Segunda-feira (09/11) às 17h30"
  // é dia da semana + horário, nunca "a segunda opção" (erro real de 05/11/2026: registrou 9h).
  const temHorario=/\b\d{1,2}(?:h\d{0,2}|:\d{2})\b/.test(t)||/\b\d{1,2}\/\d{1,2}\b/.test(t);
  const ordem=temHorario?null:t.replace(/\b(?:segunda|terca|quarta|quinta|sexta)\s*-?\s*feira\b/g,' ').match(/\b(primeir[ao]|segund[ao]|terceir[ao]|ultim[ao])\b/);
  if(ordem){const pos=ordem[1]?.startsWith('primeir')?0:ordem[1]?.startsWith('segund')?1:ordem[1]?.startsWith('terceir')?2:slots.length-1;return slots[pos];}
  const numero=t.match(/^(?:(?:a|o|opcao|numero|escolho|quero)(?:\s+(?:a|o|opcao))?\s*)?([1-9])\s*[.!]?$/);
  if(numero)return slots[Number(numero[1])-1];
  const dia=dias.findIndex(d=>new RegExp(`\\b${d}(?:-feira)?\\b`).test(t));
  const time=t.match(/\b(?:as\s+)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))\b/);
  const dm=t.match(/\b(\d{1,2})\/(\d{1,2})\b/),day=t.match(/\bdia\s+(\d{1,2})\b/);
  if(dia>=0||dm||day||time) {
    const matches=slots.filter(s=>{const p=partesAgenda(s);return (dia<0||new Date(`${dataAgenda(s)}T12:00:00Z`).getUTCDay()===dia)&&(!dm||Number(p['day'])===Number(dm[1])&&Number(p['month'])===Number(dm[2]))&&(!day||Number(p['day'])===Number(day[1]))&&(!time||Number(p['hour'])===Number(time[1])&&Number(p['minute'])===Number(time[2]??time[3]??0));});
    return matches.length===1?matches[0]:undefined;
  }
  return undefined;
}
export function dataAgenda(iso:string) {const p=partesAgenda(iso);return `${p['year']}-${p['month']}-${p['day']}`;}
export const hora=(iso:string)=>{const p=partesAgenda(iso);return `${Number(p['hour'])}h${p['minute']==='00'?'':p['minute']}`;};
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
/** "Segunda-feira, 09/11, às 14h" — formato do fluxo oficial de primeiro contato (Dra. Carolina, 03/11/2026). */
export function opcaoHorarioAna(iso:string) {
  const p=partesAgenda(iso),dia=new Date(`${dataAgenda(iso)}T12:00:00Z`).getUTCDay();
  const nome=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][dia]??'';
  return `${nome}, ${p['day']}/${p['month']}, às ${hora(iso)}`;
}
/**
 * Regra dos 2 horários (Dra. Carolina, 04/11/2026): o mais próximo da manhã e o mais próximo da tarde,
 * cada um o mais próximo disponível. Sem um dos períodos (ex.: sexta de cadastrados, só tarde), os 2 primeiros.
 */
export function parManhaTardeAna(slots:string[]) {
  const ord=[...slots].sort((a,b)=>Date.parse(a)-Date.parse(b));
  const h=(s:string)=>Number(partesAgenda(s)['hour']);
  const dia=(s:string)=>dataAgenda(s);
  const manha=(s:string)=>h(s)<12,tarde=(s:string)=>h(s)>=13;
  // Sem manhã (ex.: sexta de cadastrados, só tarde): os 2 primeiros.
  if(!ord.some(manha))return ord.slice(0,2);
  const primeiro=ord[0];
  if(!primeiro)return [];
  const d1=ord.filter(s=>dia(s)===dia(primeiro));
  // Espaçamento amigo: manhã mais próxima + tarde mais para o final do dia.
  const m1=d1.find(manha),t1=[...d1].reverse().find(tarde);
  if(m1&&t1)return [m1,t1];
  // Dois dias (Dra. Carolina, 04/11/2026): o horário restante do 1º dia + 1 manhã e 1 fim de tarde no 2º dia.
  const d2=ord.filter(s=>dia(s)!==dia(primeiro));
  const outroDia=d2[0]?dia(d2[0]):undefined;
  const seg=d2.filter(s=>dia(s)===outroDia);
  const m2=seg.find(manha),t2=[...seg].reverse().find(tarde);
  const r=[primeiro,m2,t2].filter((x):x is string=>!!x);
  return r.length>=2?r:ord.slice(0,2);
}
/** Uma única lista numerada; nunca duplica os horários em marcadores. */
export function listaHorariosAna(slots:string[],_now=new Date(),_repetida=false) {
  if(!slots.length)return 'Não encontrei novas opções livres nos próximos 15 dias úteis. Quer que a equipe entre em contato com você?';
  const linhas=slots.map(opcaoHorarioAna);
  return `Tenho estes horários livres na agenda:\n${linhas.map((l,i)=>`${i+1}. ${l}`).join('\n')}\nPara escolher um horário, responda com o número da opção desejada.`;
}
export function frustracaoHorariosAna(texto:string){return /(?:mesmos?\s+horarios?|de novo esses|esses.{0,15}nao servem|nao.{0,15}servem esses)/.test(fold(texto));}
export function pedidoOutrasOpcoesAna(texto:string){return frustracaoHorariosAna(texto)||/(?:outr[oa]s?.{0,25}(?:horario|opco|dia)|nenhum.{0,20}serve|nao posso nesses|mais tarde|mais cedo|\b(?:a|de|pela)\s+(?:tarde|manha)\b)/.test(fold(texto));}
export function temPreferenciaAna(texto:string){return /manha|tarde|mais cedo|mais tarde|\bdia\s+\d|\d{1,2}\/\d{1,2}/.test(fold(texto))||dias.some(d=>new RegExp(`\\b${d}(?:-feira)?\\b`).test(fold(texto)));}
/** Horizonte comum à leitura Calendar e à geração; datas locais, sem confundir feriados com dias úteis. */
export function horizonteAgendaAna(now=new Date()) {
  const today=dataAgenda(now.toISOString()),day=new Date(`${today}T12:00:00Z`);
  let uteis=0;
  while(uteis<15){day.setUTCDate(day.getUTCDate()+1);const data=day.toISOString().slice(0,10);if(day.getUTCDay()>0&&day.getUTCDay()<6&&!feriadoNacional(data))uteis++;}
  return Math.round((day.getTime()-new Date(`${today}T12:00:00Z`).getTime())/86400000)+1;
}
export function limitarNomeAna(texto:string,nome:string,recentes:string[]) {
  const primeiro=nome.trim().split(/\s+/)[0];
  if(!primeiro)return texto;
  const escaped=primeiro.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp(`\\b${escaped}\\b`,'i');
  if(!recentes.slice(-2).some(t=>pattern.test(t)))return texto;
  return texto.replace(new RegExp(`(?:,\\s*)?\\b${nome.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b(?:,\\s*)?`,'gi'),' ').replace(new RegExp(`(?:,\\s*)?\\b${escaped}\\b(?:,\\s*)?`,'gi'),' ').replace(/ +([!?.,])/g,'$1').replace(/ {2,}/g,' ').trim();
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
  return Date.parse(iso)>=now.getTime()+ANTECEDENCIA_MINIMA_MS&&Date.parse(iso)<now.getTime()+horizonteAgendaAna(now)*86400000&&horarioPermitido(iso,tipo)&&intervaloLivre(busy,iso,new Date(Date.parse(iso)+30*60000).toISOString());
}
export function selecionarOpcoesAna(busy:{start:string;end:string}[],now:Date,tipo:TipoCliente,texto='',anteriores:string[]=[],evitarRepeticao=false) {
  // Inclui o restante de hoje, sem mudar as regras compartilhadas dos atalhos manuais.
  const horizonte=horizonteAgendaAna(now);
  const all=gerarHorarios(busy,new Date(now.getTime()-86400000),tipo,1000,horizonte+1).filter(s=>Date.parse(s)>=now.getTime()+ANTECEDENCIA_MINIMA_MS&&Date.parse(s)<=now.getTime()+horizonte*86400000);
  const t=fold(texto);
  const periodo=/tarde|mais tarde/.test(t)?'tarde':/manha|mais cedo/.test(t)?'manha':undefined;
  const weekday=dias.findIndex(d=>new RegExp(`\\b${d}(?:-feira)?\\b`).test(t));
  const day=t.match(/\bdia\s+(\d{1,2})\b/),dm=t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  const available=all.filter(s=>(!evitarRepeticao||!anteriores.some(a=>Date.parse(a)===Date.parse(s)))&&(!periodo||(periodo==='tarde'?Number(partesAgenda(s)['hour'])>=13:Number(partesAgenda(s)['hour'])<12))&&(weekday<0||new Date(`${dataAgenda(s)}T12:00:00Z`).getUTCDay()===weekday)&&(!day||Number(partesAgenda(s)['day'])===Number(day[1]))&&(!dm||Number(partesAgenda(s)['day'])===Number(dm[1])&&Number(partesAgenda(s)['month'])===Number(dm[2])));
  const semPeriodo=!!periodo&&!available.length;
  // Regra dos 2 horários: 1 manhã + 1 tarde (ou 2 do período pedido); ao pedir outras opções, prefere dias novos.
  const oldDates=new Set(anteriores.map(dataAgenda));
  const diasNovos=evitarRepeticao?available.filter(s=>!oldDates.has(dataAgenda(s))):[];
  return {slots:parManhaTardeAna(diasNovos.length?diasNovos:available),semPeriodo};
}

/**
 * Formato oficial da confirmação de consulta, determinado pela Dra. Carolina:
 * a linha do horário e a linha do link da reunião, separadas por uma linha em branco.
 * O link só sai quando a agenda devolveu um endereço Meet real; nunca é inventado.
 */
export function mensagemConfirmacaoAna(inicio:string,meetUrl?:string,nome?:string) {
  const link=meetUrl&&/^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(meetUrl)?meetUrl:undefined;
  const d=new Date(inicio);
  const p=Object.fromEntries(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value])) as {day:string;month:string;year:string;hour:string;minute:string};
  const horario=p.minute==='00'?`${Number(p.hour)}h`:`${Number(p.hour)}h${p.minute}`;
  const primeiro=(nome??'').trim().split(/\s+/)[0]??'';
  const ola=primeiro?`Olá, ${primeiro.charAt(0).toUpperCase()}${primeiro.slice(1).toLowerCase()}!`:'Olá!';
  return `${ola} 😊 Sua consulta inicial com a Dra. Carolina está agendada!\n\n📅 Data: ${p.day}/${p.month}/${p.year}\n🕒 Horário: ${horario}${link?`\n🔗 Link: ${link}`:''}\n\nPedimos que entre alguns minutos antes. Até lá!`;
}
