import type { Conversa, Mensagem } from '../../mock-data';

/**
 * Origem confiável de cada mensagem, só a partir de campos gravados pelo servidor:
 * - cliente: `de: 'cliente'` (webhook message_received);
 * - automacao: com `automacaoKey` (camada operacional) ou enviada pela Anne sem `respostaAnaDe` (rotinas antigas:
 *   confirmação, lembrete, coleta...);
 * - anne: resposta conversacional (`respostaAnaDe` aponta a mensagem do cliente respondida);
 * - equipe: demais mensagens do escritório (Manager ou celular do escritório, eco `message_create`);
 * - sistema: avisos internos (`de: 'sistema'`).
 */
export type OrigemMensagem = 'cliente' | 'equipe' | 'anne' | 'automacao' | 'sistema';

// Só o autor gravado pelas rotinas ("Ana · assistente virtual") ou exatamente "Ana"/"Anne":
// uma pessoa da equipe chamada "Ana Paula" continua sendo equipe.
const AUTOR_ANNE = /assistente virtual|^anne?$/i;

export function origemMensagem(m: Pick<Mensagem, 'de' | 'autor' | 'respostaAnaDe' | 'automacaoKey'>): OrigemMensagem {
  if (m.de === 'cliente') return 'cliente';
  if (m.de === 'sistema') return 'sistema';
  if (m.automacaoKey) return 'automacao';
  if (m.respostaAnaDe) return 'anne';
  if (m.autor && AUTOR_ANNE.test(m.autor.trim())) return 'automacao';
  return 'equipe';
}

export const ROTULOS_ORIGEM: Record<OrigemMensagem, string> = {
  cliente: 'Cliente',
  equipe: 'Equipe',
  anne: 'Anne',
  automacao: 'Automação da Anne',
  sistema: 'Sistema',
};

function tempo(m: Pick<Mensagem, 'dataHora'>) {
  const t = Date.parse(m.dataHora ?? '');
  return Number.isFinite(t) ? t : undefined;
}

/** Data da última mensagem escrita pela equipe (nunca a de uma automação ou da Anne). */
export function ultimaIntervencaoHumana(c: Pick<Conversa, 'mensagens'>): string | undefined {
  let melhor: number | undefined;
  for (const m of c.mensagens) {
    if (origemMensagem(m) !== 'equipe') continue;
    const t = tempo(m);
    if (t !== undefined && (melhor === undefined || t > melhor)) melhor = t;
  }
  return melhor === undefined ? undefined : new Date(melhor).toISOString();
}

/** Equipe escreveu dentro da janela de prioridade humana. */
export function equipeEmAtendimento(c: Pick<Conversa, 'mensagens'>, janelaMin: number, agora = new Date()) {
  const ultima = ultimaIntervencaoHumana(c);
  return !!ultima && agora.getTime() - Date.parse(ultima) < janelaMin * 60000;
}

/** Última mensagem do escritório no canal (equipe, Anne ou automação). */
export function ultimaMensagemEscritorio(c: Pick<Conversa, 'mensagens'>, canal = 'ultramsg') {
  return [...c.mensagens].reverse().find(m => m.de === 'escritorio' && (!m.canal || m.canal === canal));
}

/** A mensagem da equipe veio depois desta data? (a resposta do cliente passa a ser da equipe). */
export function equipeEscreveuDepois(c: Pick<Conversa, 'mensagens'>, desde: string | undefined) {
  const limite = Date.parse(desde ?? '');
  if (!Number.isFinite(limite)) return false;
  return c.mensagens.some(m => origemMensagem(m) === 'equipe' && (tempo(m) ?? 0) > limite);
}
