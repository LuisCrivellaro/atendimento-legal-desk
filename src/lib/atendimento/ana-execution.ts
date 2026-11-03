import type { Conversa, Mensagem } from '../mock-data';

export type ExecucaoAna = { estado: 'executando' | 'aguardando' | 'enviando' | 'concluida' | 'incerta'; tentativas: number; desde: string; retryEm?: string };

export function podeExecutarAna(m: Mensagem, agora = Date.now()) {
  const e = m.iaExecucao;
  if (!e) return !m.iaProcessada;
  if (e.tentativas >= 3 || e.estado === 'enviando' || e.estado === 'incerta' || e.estado === 'concluida') return false;
  return e.estado === 'aguardando' ? Date.parse(e.retryEm ?? '') <= agora : Date.parse(e.desde) + 90000 <= agora;
}

export function autorizaEnvioAna(c: Conversa, origem: string, controle: string | undefined, encaminhamento = false) {
  return c.mensagens.at(-1)?.id === origem && !c.agenteAna?.pausa &&
    c.agenteAna?.controleHumanoEm === controle && (!c.agenteAna?.humano || encaminhamento) &&
    !c.mensagens.some(m => m.respostaAnaDe === origem) && !excessoRespostasAna(c);
}
/** Proteção contra loop: no máximo 6 respostas da Ana em 10 minutos na mesma conversa. */
export function excessoRespostasAna(c: Conversa, agora = Date.now(), limite = 6) {
  return c.mensagens.filter(m => m.de === 'agente' && !!m.respostaAnaDe && agora - Date.parse(m.enviadoEm ?? m.hora ?? '') < 600000).length >= limite;
}
