import type { Conversa } from '../mock-data';

/**
 * Avisos operacionais para a equipe, gravados no JSON da conversa (sem migração).
 * Aparecem no Atendimento e no Assessor; nunca são enviados ao cliente.
 */
export type TipoAvisoEquipe = 'confirmacao40' | 'coleta' | 'audiencia' | 'projuris' | 'contrato' | 'anexo';

export interface AvisoEquipe {
  /** Determinístico: o mesmo fato nunca gera dois avisos. */
  id: string;
  tipo: TipoAvisoEquipe;
  texto: string;
  criadoEm: string;
  prioridade?: boolean | undefined;
  /** Texto pronto para a equipe revisar e enviar pelo fluxo normal (com prévia). Nunca é enviado sozinho. */
  textoPronto?: string | undefined;
  resolvidoEm?: string | undefined;
  resolvidoPor?: string | undefined;
}

/** Acrescenta o aviso uma única vez (mesmo id não duplica nem reabre um aviso resolvido). */
export function registrarAviso<T extends Pick<Conversa, 'avisosEquipe' | 'timeline'>>(c: T, aviso: AvisoEquipe, timeline = true): T {
  if ((c.avisosEquipe ?? []).some(a => a.id === aviso.id)) return c;
  return {
    ...c,
    avisosEquipe: [...(c.avisosEquipe ?? []), aviso],
    ...(timeline ? { timeline: [...(c.timeline ?? []), { data: aviso.criadoEm, evento: `Aviso para a equipe: ${aviso.texto}` }] } : {}),
  };
}

export function avisosPendentes(c: Pick<Conversa, 'avisosEquipe'>) {
  return (c.avisosEquipe ?? []).filter(a => !a.resolvidoEm);
}

export function resolverAviso<T extends Pick<Conversa, 'avisosEquipe'>>(c: T, id: string, quem: string, agora = new Date()): T {
  return { ...c, avisosEquipe: (c.avisosEquipe ?? []).map(a => a.id === id && !a.resolvidoEm ? { ...a, resolvidoEm: agora.toISOString(), resolvidoPor: quem.slice(0, 80) } : a) };
}
