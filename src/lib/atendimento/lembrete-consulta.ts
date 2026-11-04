import { dataAgenda, hora } from './ana-scheduling';

/** Lembrete do dia da consulta (prompt da Dra. Carolina, 04/11/2026), enviado às 08:00 de São Paulo. */
export function mensagemLembreteAna(nome: string, inicio: string) {
  const primeiro = nome.trim() ? `, ${nome.trim()}` : '';
  return `Olá${primeiro}! Aqui é a Ana, do escritório CS Advocacia.\nPassando para lembrar da sua consulta agendada para hoje, às ${hora(inicio)}.\nVocê confirma a sua presença? Responda com SIM para confirmar ou NÃO para cancelar/reagendar.`;
}

/** Consulta ainda futura e marcada para o dia corrente em São Paulo. */
export function consultaDeHoje(inicio: string | undefined, agora = new Date()) {
  return !!inicio && Date.parse(inicio) > agora.getTime() && dataAgenda(inicio) === dataAgenda(agora.toISOString());
}

export interface LembreteConsulta { inicio: string; enviadoEm: string; confirmadoEm?: string | undefined }

/** Lembrete vigente: enviado para a consulta atual, hoje, ainda sem confirmação. */
export function lembreteAtivo(l: LembreteConsulta | undefined, consulta: string | undefined, agora = new Date()) {
  return !!l && !l.confirmadoEm && l.inicio === consulta && consultaDeHoje(consulta, agora);
}

/** Só "SIM"/"NÃO" curtos contam como resposta ao lembrete. */
export function respostaLembreteAna(texto: string) {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/^(?:sim|s|confirmo|confirmado|sim,? confirmo|sim,? vou|vou sim)[.!\s]*$/.test(t)) return 'sim' as const;
  if (/^(?:nao|n|nao vou|nao posso|nao vou poder)[.!\s]*$/.test(t)) return 'nao' as const;
  return undefined;
}
