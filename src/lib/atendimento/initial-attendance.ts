import type { Conversa } from '../mock-data';

export const saudacaoInicialAna = 'Olá!\n\nSeja bem-vindo(a) 😊\n\nEquipe CS Advocacia\n\nVou te ajudar!\n\nNossa primeira consulta é on-line e gratuita.\n\nQual o seu nome Completo ?';

/** O padrão inicial não substitui modo explícito, pausa ou tomada humana. */
export function iniciarAtendimentoAutomatico(c: Conversa): Conversa {
  if (c.modoIA || c.agenteAna?.pausa || c.agenteAna?.humano || c.mensagens.some(m => m.de === 'escritorio')) return c;
  return { ...c, modoIA: 'Automática' };
}