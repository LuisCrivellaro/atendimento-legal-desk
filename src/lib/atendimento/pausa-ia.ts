import type { Conversa } from '../mock-data';

/**
 * Pausa da IA da Anne (`OfficeState.anaPausa`). O servidor liga sozinho quando o provedor do modelo recusa a chave ou
 * a conta (401/402/403/404). Ela suspende só as respostas escritas pelo modelo. Confirmações, lembretes, cobrança de
 * documentos, reagendamento, textos oficiais e envios da equipe continuam, porque nada disso usa o modelo.
 * O monitor de 5 minutos testa a chave e retoma sozinho; sênior/admin também retomam pela tela do Atendimento.
 * Na retomada, a última mensagem de cada cliente recebida durante a pausa volta para a fila da Anne.
 */
export interface PausaIA { ativa: boolean; motivo: string; desde?: string | undefined }

export function iaPausada(state: { anaPausa?: { ativa?: boolean } | undefined } | null | undefined) {
  return state?.anaPausa?.ativa === true;
}

/** Falha de chave/conta do provedor (não temporária): pausa a IA do escritório. */
export function falhaPausaIA(e: { code?: string | undefined; statusCode?: number | undefined }) {
  return e.code === 'chave_invalida' || [401, 402, 403, 404].includes(e.statusCode ?? 0);
}

/** Texto curto da pausa para a tela (nunca o corpo do erro do provedor). */
export function motivoPausaIA(e: { code?: string | undefined; statusCode?: number | undefined }) {
  return e.code === 'chave_invalida' || e.statusCode === 401 || e.statusCode === 403
    ? 'O Claude recusou a chave de acesso (ANTHROPIC_API_KEY).'
    : `O provedor da IA recusou o acesso (HTTP ${e.statusCode ?? '?'}).`;
}

/** Mensagens mais antigas que isto não são respondidas na retomada (a equipe atende). */
export const JANELA_RETOMADA_MS = 24 * 3600000;
/** Pausa sem data de início (gravada antes desta regra): só as mensagens das últimas 6 h voltam para a fila. */
export const JANELA_SEM_INICIO_MS = 6 * 3600000;
/** A mensagem que causou a pausa chega um pouco antes de ela ser gravada. */
const MARGEM_INICIO_MS = 5 * 60000;

/**
 * Estaciona a mensagem durante a pausa: `aguardando` sem horário de nova tentativa, então a recuperação não a pega
 * até a retomada. A tentativa não conta, porque o modelo não chegou a responder.
 */
export function estacionarMensagem(c: Conversa, messageId: string): Conversa {
  return {
    ...c,
    mensagens: c.mensagens.map(m => m.id === messageId
      ? { ...m, iaProcessada: true, iaExecucao: { estado: 'aguardando' as const, tentativas: Math.max(0, (m.iaExecucao?.tentativas ?? 1) - 1), desde: m.iaExecucao?.desde ?? new Date().toISOString() } }
      : m),
  };
}

/**
 * Mensagem que a retomada devolve à fila: a última da conversa, do cliente, no WhatsApp, sem equipe no controle,
 * estacionada pela pausa ou recebida depois do início dela sem ter sido processada, e com menos de 24 h.
 */
export function mensagemParaRetomar(c: Conversa, pausa: Pick<PausaIA, 'desde'> | undefined, agora: number): string | undefined {
  if (c.agenteAna?.humano || c.agenteAna?.pausa) return undefined;
  const m = c.mensagens.at(-1);
  if (!m || m.de !== 'cliente' || m.canal !== 'ultramsg' || m.tipo === 'audio') return undefined;
  const quando = Date.parse(m.dataHora ?? '');
  if (!Number.isFinite(quando) || quando < agora - JANELA_RETOMADA_MS) return undefined;
  const e = m.iaExecucao;
  if (e) return e.estado === 'aguardando' && !e.retryEm ? m.id : undefined;
  if (m.iaProcessada) return undefined;
  const desde = Date.parse(pausa?.desde ?? '');
  const inicio = Number.isFinite(desde) ? desde - MARGEM_INICIO_MS : agora - JANELA_SEM_INICIO_MS;
  return quando >= inicio ? m.id : undefined;
}

/** Devolve a mensagem à fila: a recuperação do monitor a processa no mesmo ciclo. */
export function reenfileirar(c: Conversa, messageId: string, agora: Date): Conversa {
  const iso = agora.toISOString();
  return {
    ...c,
    mensagens: c.mensagens.map(m => m.id === messageId
      ? { ...m, iaProcessada: true, iaExecucao: { estado: 'aguardando' as const, tentativas: m.iaExecucao?.tentativas ?? 0, desde: iso, retryEm: iso } }
      : m),
  };
}
