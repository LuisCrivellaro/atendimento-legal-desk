import { chosenSlot } from '../atendimento';

/** A escolha vem do texto do cliente, nunca da interpretação livre da IA. */
export function escolherReservaAna(input: { texto: string; horarios: string[]; real: boolean; teste: boolean; modo: string; bloqueado: boolean; now?: Date }) {
  if (!input.real || !input.teste || input.modo !== 'Automática' || input.bloqueado) return undefined;
  const slot = chosenSlot(input.horarios, input.texto);
  return slot && Date.parse(slot) > (input.now ?? new Date()).getTime() ? slot : undefined;
}

export interface ReservaCalendar { id: string; inicio: string; fim: string; url?: string; }

/** ID por horário na agenda compartilhada impede duplicações entre mensagens e contatos. */
export async function idReservaCalendar(inicio: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ana:primary:${new Date(inicio).toISOString()}`));
  return `ana${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function intervaloLivre(ocupados: { start: string; end: string }[], inicio: string, fim: string) {
  const s = Date.parse(inicio), e = Date.parse(fim);
  return Number.isFinite(s) && Number.isFinite(e) && s < e && ocupados.every(b => {
    const bs = Date.parse(b.start), be = Date.parse(b.end);
    return Number.isFinite(bs) && Number.isFinite(be) && !(s < be && e > bs);
  });
}