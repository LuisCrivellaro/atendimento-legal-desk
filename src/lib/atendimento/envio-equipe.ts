// Regras puras do envio de texto pela equipe (servidor): reserva com o id gerado no navegador antes de chamar o canal,
// conclusão só com o recibo do canal e falha registrada. Nova tentativa com o mesmo id nunca duplica a mensagem.
import type { Conversa, Mensagem } from '../mock-data';

/** Reserva mais nova que isso é um envio em andamento; mais velha, sem conclusão, é tratada como incerta. */
export const ENVIO_EM_ANDAMENTO_MS = 90_000;

export type DecisaoReserva =
  | { acao: 'reservar'; conversa: Conversa }
  | { acao: 'jaEnviada'; mensagem: Mensagem }
  | { acao: 'emAndamento' }
  | { acao: 'conferir' };

const PROXIMO_PASSO_HUMANO = 'Equipe assumiu esta conversa. Retomar Ana exige ação explícita.';

export function horaSaoPaulo(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export function reservarEnvioEquipe(c: Conversa, p: { id: string; texto: string; autor: string; agora: Date; reenvioConferido?: boolean | undefined }): DecisaoReserva {
  const existente = c.mensagens.find(m => m.id === p.id);
  if (existente) {
    if (existente.de !== 'escritorio') throw new Error('Identificador de mensagem inválido.');
    if (existente.status) return { acao: 'jaEnviada', mensagem: existente };
    const e = existente.envio;
    if (e?.estado === 'enviando') {
      const idade = p.agora.getTime() - Date.parse(e.reservadoEm);
      if (Number.isFinite(idade) && idade < ENVIO_EM_ANDAMENTO_MS) return { acao: 'emAndamento' };
      // Reserva sem conclusão (servidor interrompido no meio): pode ter saído; só reenvia com conferência.
      if (!p.reenvioConferido) return { acao: 'conferir' };
    }
    if (e?.estado === 'falhou' && e.ambiguo && !p.reenvioConferido) return { acao: 'conferir' };
  }
  const agora = p.agora.toISOString();
  const mensagem: Mensagem = {
    ...(existente ?? {}),
    id: p.id, de: 'escritorio', texto: existente?.texto ?? p.texto, autor: existente?.autor ?? p.autor,
    // Horário real da tentativa (nunca inventado): a nova tentativa reflete quando saiu de fato.
    hora: horaSaoPaulo(p.agora), dataHora: agora,
    envio: { estado: 'enviando', reservadoEm: agora },
  };
  return {
    acao: 'reservar',
    conversa: {
      ...c,
      iaRetida: undefined,
      mensagens: existente ? c.mensagens.map(m => m.id === p.id ? mensagem : m) : [...c.mensagens, mensagem],
      // Envio da equipe assume a conversa (a Anne para), como em enviarMensagemCanal.
      agenteAna: { ...c.agenteAna, humano: true, controleHumanoEm: agora, proximoPasso: PROXIMO_PASSO_HUMANO },
    },
  };
}

export function concluirEnvioEquipe(c: Conversa, id: string, r: { status: 'simulada' | 'enviada'; canal: string; idExterno?: string | undefined }): Conversa {
  return {
    ...c,
    mensagens: c.mensagens.map(m => {
      if (m.id !== id) return m;
      const { envio: _e, ...resto } = m;
      return { ...resto, status: r.status, canal: r.canal, ...(r.idExterno ? { idExterno: r.idExterno } : {}) };
    }),
  };
}

export function falharEnvioEquipe(c: Conversa, id: string, erro: string, ambiguo: boolean, agora: Date): Conversa {
  return {
    ...c,
    mensagens: c.mensagens.map(m => m.id === id && !m.status
      ? { ...m, envio: { estado: 'falhou' as const, reservadoEm: m.envio?.reservadoEm ?? agora.toISOString(), falhouEm: agora.toISOString(), erro: erro.slice(0, 300), ...(ambiguo ? { ambiguo: true } : {}) } }
      : m),
  };
}

/**
 * Falha depois de chamar o provedor (timeout, rede, resposta sem confirmação): a mensagem pode ter chegado.
 * Erros de regra, destino ou configuração acontecem antes de qualquer chamada externa.
 */
export function falhaAmbigua(erro: string) {
  return /não foi concluído/i.test(erro);
}
