/**
 * Mensagens programadas: só saem se continuarem necessárias, válidas e autorizadas no momento do envio.
 * A revalidação é pura; o envio passa pelo motor (permissão, modo, prioridade humana, horário) e pela
 * conferência final da camada de envio.
 */

export type CondicaoProgramada =
  | { tipo: 'consulta_marcada'; inicio: string }
  | { tipo: 'documentos_pendentes'; itens: string[] }
  | { tipo: 'sem_resposta_cliente_desde'; desde: string }
  | { tipo: 'nenhuma' };

export interface DadosProgramada {
  texto: string;
  agendadaPara: string;
  condicao: CondicaoProgramada;
}

export interface ContextoProgramada {
  consultaAgendada?: string | undefined;
  /** Início com recibo verificado da agenda. */
  reservaInicio?: string | undefined;
  /** Itens ainda faltantes no checklist real. */
  faltantes: string[];
  /** Data da última mensagem do cliente. */
  ultimaMensagemCliente?: string | undefined;
}

export type RevalidacaoProgramada =
  | { acao: 'aguardar'; ate: string }
  | { acao: 'enviar' }
  | { acao: 'cancelar'; motivo: 'vencida' | 'nao_necessaria' | 'condicao_invalida' };

export function revalidarProgramada(p: DadosProgramada & { expiraEm: string }, ctx: ContextoProgramada, agora = new Date()): RevalidacaoProgramada {
  const quando = Date.parse(p.agendadaPara), validade = Date.parse(p.expiraEm);
  if (!Number.isFinite(quando) || !Number.isFinite(validade) || validade <= quando) return { acao: 'cancelar', motivo: 'condicao_invalida' };
  if (agora.getTime() >= validade) return { acao: 'cancelar', motivo: 'vencida' };
  if (agora.getTime() < quando) return { acao: 'aguardar', ate: p.agendadaPara };
  const c = p.condicao;
  switch (c.tipo) {
    case 'consulta_marcada': {
      const inicio = Date.parse(c.inicio);
      if (!Number.isFinite(inicio) || ctx.consultaAgendada !== c.inicio || ctx.reservaInicio !== c.inicio || inicio <= agora.getTime()) return { acao: 'cancelar', motivo: 'nao_necessaria' };
      return { acao: 'enviar' };
    }
    case 'documentos_pendentes': {
      if (!c.itens.length) return { acao: 'cancelar', motivo: 'condicao_invalida' };
      return c.itens.some(i => ctx.faltantes.includes(i)) ? { acao: 'enviar' } : { acao: 'cancelar', motivo: 'nao_necessaria' };
    }
    case 'sem_resposta_cliente_desde': {
      const desde = Date.parse(c.desde), ultima = Date.parse(ctx.ultimaMensagemCliente ?? '');
      if (!Number.isFinite(desde)) return { acao: 'cancelar', motivo: 'condicao_invalida' };
      return Number.isFinite(ultima) && ultima > desde ? { acao: 'cancelar', motivo: 'nao_necessaria' } : { acao: 'enviar' };
    }
    case 'nenhuma':
      return { acao: 'enviar' };
  }
}
