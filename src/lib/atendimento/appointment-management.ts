import type { ReservaCalendar } from './calendar-booking';

export type AlteracaoConsulta = 'cancelar' | 'remarcar';
/** Autorizações vêm do texto atual, não da classificação livre do modelo. */
export function decidirAlteracaoConsulta(texto:string,existente:boolean,pendente?:AlteracaoConsulta):AlteracaoConsulta|'perguntar'|undefined {
  if(!existente)return undefined;
  const t=texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if(/\bnao\b|\bnão\b|\b(?:talvez|pensar|manter)\b/.test(t))return undefined;
  if(/\?|\b(?:como|posso|possivel|poderia|funciona)\b/.test(t))return 'perguntar';
  const cancelar=/\b(?:cancelar|cancele|cancela|cancelamento)\b/.test(t);
  const remarcar=/\b(?:remarcar|remarque|remarca|reagendar|reagendamento|remarcacao)\b/.test(t);
  if(cancelar&&remarcar)return 'perguntar';
  if(cancelar)return 'cancelar';
  if(remarcar)return 'remarcar';
  if(pendente&&/^(?:sim|confirmo|autorizo|pode sim)[.!]*$/.test(t))return pendente;
  if(/\bagend(?:ar|amento)\b|\bmarcar\b.{0,30}\b(?:consulta|reuniao|horario)\b/.test(t))return 'perguntar';
  return undefined;
}

export function reservaDoAtendimento(event:{id?:string;status?:string;start?:{dateTime?:string};end?:{dateTime?:string};extendedProperties?:{private?:{conversa?:string}}},conversaId:string,reserva:ReservaCalendar) {
  return event.id===reserva.id&&event.extendedProperties?.private?.conversa===conversaId&&Date.parse(event.start?.dateTime??'')===Date.parse(reserva.inicio)&&Date.parse(event.end?.dateTime??'')===Date.parse(reserva.fim);
}