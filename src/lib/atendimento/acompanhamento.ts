import type { Conversa } from '../mock-data';
import { rascunhoComunicacaoEvento } from './biblioteca/selecao';

/**
 * Concierge de acompanhamento (P0-4), regras puras.
 * 1) Pergunta de encerramento depois de notícia aprovada e entregue (S3; texto PROPOSTO, D4).
 * 2) Aviso de audiência/perícia a partir do registro oficial, com revisão da revisora antes de sair.
 */

/** D4 (fallback): texto proposto, editável em Mensagens prontas pelo mesmo id. */
export const PERGUNTA_ENCERRAMENTO = { id: 'proposta-encerramento', texto: 'Sua dúvida foi esclarecida? 😊 Se ainda quiser conversar com a Dra. Carolina, posso verificar os horários de retorno para você.' } as const;

export interface EncerramentoProcesso { codigo: string; reservadoEm: string; enviadoEm?: string | undefined; idExterno?: string | undefined; respondidoEm?: string | undefined; resposta?: 'sim' | 'nao' | undefined }

/** Uma única vez por pedido, só para notícia pedida pelo cliente (não lista de seleção, não aviso de evento, não recusa). */
export function deveEnviarEncerramento(p: { codigo: string; selecaoProcessos?: number[] | undefined; evento?: unknown }, acao: 'aprovar' | 'corrigir' | 'recusar', atual?: EncerramentoProcesso) {
  return acao !== 'recusar' && !p.selecaoProcessos && !p.evento && atual?.codigo !== p.codigo;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.!,;:?\s]+/g, ' ').trim();

/**
 * "Sim" explícito para verificar horários. "Sim, esclareceu, obrigado" responde à primeira pergunta e não pede agenda.
 * Qualquer outra resposta segue o fluxo normal.
 */
export function respostaEncerramento(texto: string): 'sim' | 'nao' | undefined {
  const t = fold(texto);
  if (!t || t.length > 80) return undefined;
  if (/^(?:nao|n|nao obrigad[oa]|nao precisa|nao precisa obrigad[oa]|esta tudo certo|tudo certo|tudo esclarecido|esclareceu|foi esclarecida|esclarecida|sim esclareceu|sim foi esclarecida|sim esclarecida|sim obrigad[oa]|entendi|entendi obrigad[oa]|obrigad[oa]|ok obrigad[oa])(?: obrigad[oa])?$/.test(t)) return 'nao';
  if (/^(?:sim|quero|quero sim|sim quero|pode|pode sim|pode verificar|pode ver|sim pode|sim pode verificar|gostaria|gostaria sim|sim gostaria|sim por favor|por favor|claro|quero conversar|quero falar com (?:a )?(?:dra|doutora)(?: carolina)?|sim quero conversar)$/.test(t)) return 'sim';
  return undefined;
}

/** A pergunta só vale enquanto for a última mensagem do escritório no canal e não tiver sido respondida. */
export function encerramentoRespondivel(c: Pick<Conversa, 'agenteAna' | 'mensagens'>, canal: string, agora = new Date()) {
  const e = c.agenteAna?.encerramentoProcesso;
  if (!e?.enviadoEm || e.respondidoEm || !e.idExterno || agora.getTime() - Date.parse(e.enviadoEm) > 7 * 86400_000) return false;
  const ultima = [...c.mensagens].reverse().find(m => m.de === 'escritorio' && (!m.canal || m.canal === canal));
  return ultima?.idExterno === e.idExterno;
}

// ---------- Aviso de audiência e perícia ----------

export type TipoEvento = 'audiencia' | 'pericia';

export function tipoEventoProcessual(texto: string): TipoEvento | undefined {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/\bpericia\b|\bpericial\b/.test(t)) return 'pericia';
  if (/\baudiencia\b/.test(t)) return 'audiencia';
  return undefined;
}

/**
 * Data e hora do evento só quando escritas no próprio registro ("designada para 10/12/2026 às 14h30").
 * A data do andamento é a data do registro, não a do evento: nunca é usada como data da audiência.
 */
export function dataHoraDoEvento(texto: string): { data?: string; hora?: string } {
  const d = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(texto);
  // Sem \b antes de "às": sem a flag u, "à" não conta como letra e o \b nunca casaria.
  const h = /(?:^|[\s,;(])(?:as|às|a partir das|horas?:?)\s*(\d{1,2})(?::|h)(\d{2})?(?!\d)/i.exec(texto)
    ?? /\b(\d{1,2}):(\d{2})\b/.exec(texto);
  const hora = h ? `${Number(h[1])}h${h[2] && h[2] !== '00' ? h[2] : ''}` : undefined;
  return { ...(d ? { data: `${d[1]}/${d[2]}/${d[3]}` } : {}), ...(hora && Number(h?.[1]) < 24 ? { hora } : {}) };
}

export interface EventoOficial {
  codigoProcesso: number;
  /** Número do processo como veio do ProJuris; sem número, fica fora do texto. */
  numero?: string | undefined;
  vara?: string | undefined;
  tipo: TipoEvento;
  descricao: string;
  data?: string | undefined;
  hora?: string | undefined;
  modalidade?: string | undefined;
  local?: string | undefined;
  /** Normalizados pelo mapeamento: ausente = protegido. */
  privado: boolean;
  segredoJustica: boolean;
}

/** Andamento privado ou processo em segredo de justiça nunca gera aviso ao cliente. */
export function eventoPodeAvisar(e: Pick<EventoOficial, 'privado' | 'segredoJustica'>) {
  return e.privado === false && e.segredoJustica === false;
}

/** Deduplicação por processo, tipo, data e hora: data alterada gera novo aviso. */
export function chaveEvento(e: Pick<EventoOficial, 'codigoProcesso' | 'tipo' | 'data' | 'hora' | 'descricao'>) {
  return `${e.codigoProcesso}|${e.tipo}|${e.data ?? 'sem-data'}|${e.hora ?? 'sem-hora'}${e.data ? '' : `|${e.descricao.trim().slice(0, 80)}`}`;
}

/**
 * Rascunho para a revisora a partir da BIBLIOTECA OFICIAL (11.1 comunicação de audiência, 12.1 perícia agendada),
 * só com dados do registro. Desde 26/11/2026 o texto oficial nunca é cortado: campo sem dado fica visível entre
 * colchetes para a revisão completar ("corrigir"), e a entrega é bloqueada enquanto houver campo pendente.
 * `_modelos` (mensagens prontas antigas) não é mais usado; o parâmetro fica por compatibilidade.
 */
export function rascunhoAvisoEvento(e: EventoOficial, nome: string, _modelos?: { audiencia: string; pericia: string }) {
  const primeiro = nome.replace(/^\s*(?:RT|AC)\s*-\s*[^-]*-\s*/i, '').trim().split(/\s+/)[0] ?? '';
  const n = /^[\p{L}'-]{2,40}$/u.test(primeiro) ? primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR') : undefined;
  return rascunhoComunicacaoEvento({ tipo: e.tipo, data: e.data, hora: e.hora, modalidade: e.modalidade, numero: e.numero, vara: e.vara, local: e.local }, n).texto;
}
