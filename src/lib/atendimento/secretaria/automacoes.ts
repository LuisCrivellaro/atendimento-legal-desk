import type { Funcionalidade } from './config';
import { respostaConfirmacao40 } from '../confirmacao-consulta';
import { respostaLembreteAna } from '../lembrete-consulta';

/**
 * Automações com contexto e ciclo de vida próprios (JSON do caso, sem migração).
 * Cada automação tem identificador determinístico, permissão, estado, validade e condições de encerramento.
 * Estados finais nunca reabrem: a mesma automação (mesmo id) não é recriada nem reenviada.
 */

export type TipoAutomacao =
  | 'confirmacao_consulta'
  | 'lembrete_consulta'
  | 'reagendamento'
  | 'cancelamento'
  | 'solicitacao_documentos'
  | 'andamento_processual'
  | 'followup'
  | 'mensagem_programada';

export type EstadoAutomacao =
  | 'agendada'
  | 'aguardando_resposta'
  | 'pausada'
  | 'concluida'
  | 'cancelada'
  | 'expirada'
  | 'encaminhada'
  | 'falhou';

export const ESTADOS_FINAIS: EstadoAutomacao[] = ['concluida', 'cancelada', 'expirada', 'encaminhada', 'falhou'];

export const ROTULOS_TIPO: Record<TipoAutomacao, string> = {
  confirmacao_consulta: 'Confirmação da consulta (40 min)',
  lembrete_consulta: 'Lembrete do dia da consulta',
  reagendamento: 'Reagendamento',
  cancelamento: 'Cancelamento',
  solicitacao_documentos: 'Solicitação de documentos',
  andamento_processual: 'Andamento processual',
  followup: 'Follow-up',
  mensagem_programada: 'Mensagem programada',
};

export const ROTULOS_ESTADO: Record<EstadoAutomacao, string> = {
  agendada: 'Agendada',
  aguardando_resposta: 'Aguardando resposta do cliente',
  pausada: 'Pausada pela equipe',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  encaminhada: 'Encaminhada à equipe',
  falhou: 'Falhou (equipe avisada)',
};

/** Funcionalidade da matriz de permissões que autoriza cada tipo. */
export const PERMISSAO_DO_TIPO: Record<TipoAutomacao, Funcionalidade> = {
  confirmacao_consulta: 'confirmacao_consulta',
  lembrete_consulta: 'lembrete_consulta',
  reagendamento: 'reagendamento',
  cancelamento: 'cancelamento',
  solicitacao_documentos: 'solicitacao_documentos',
  andamento_processual: 'andamento_processual',
  followup: 'followup',
  mensagem_programada: 'mensagem_programada',
};

export interface AutomacaoAtiva {
  /** Determinístico: `${tipo}:${referência}` (ex.: confirmacao_consulta:2026-11-26T17:00:00.000Z). */
  id: string;
  tipo: TipoAutomacao;
  estado: EstadoAutomacao;
  criadaEm: string;
  atualizadaEm: string;
  /** Depois disto a automação expira sozinha; nenhuma resposta é associada a ela. */
  expiraEm: string;
  /** Fatos verificados que a automação usa (horário da consulta com recibo, id do evento, itens do checklist...). */
  referencia: { inicio?: string | undefined; eventoId?: string | undefined; pedido?: string | undefined; itens?: string[] | undefined };
  /** Mensagem enviada ao cliente (recibo do canal). */
  mensagem?: { idExterno?: string | undefined; texto?: string | undefined; enviadaEm?: string | undefined } | undefined;
  /** Estado interno de fluxos com várias etapas (ex.: reagendamento). */
  etapa?: import('./reagendamento').EstadoReagendamento | undefined;
  /** Mensagem programada pela equipe (texto, horário e condição revalidada antes do envio). */
  programada?: import('./programadas').DadosProgramada | undefined;
  resultado?: string | undefined;
  /** Quem iniciou: rotina do servidor ou a equipe (delegação explícita no modo Híbrido). */
  iniciadaPor: 'rotina' | 'equipe';
  historico: { em: string; estado: EstadoAutomacao; motivo: string }[];
}

const TRANSICOES: Record<EstadoAutomacao, EstadoAutomacao[]> = {
  agendada: ['aguardando_resposta', 'pausada', 'concluida', 'cancelada', 'expirada', 'encaminhada', 'falhou'],
  aguardando_resposta: ['aguardando_resposta', 'pausada', 'concluida', 'cancelada', 'expirada', 'encaminhada', 'falhou'],
  pausada: ['agendada', 'aguardando_resposta', 'cancelada', 'expirada', 'encaminhada'],
  concluida: [], cancelada: [], expirada: [], encaminhada: [], falhou: [],
};

const LIMITE_HISTORICO = 12;
const LIMITE_AUTOMACOES = 30;

export function automacaoFinal(a: Pick<AutomacaoAtiva, 'estado'>) {
  return ESTADOS_FINAIS.includes(a.estado);
}

export function automacaoVencida(a: Pick<AutomacaoAtiva, 'expiraEm'>, agora = new Date()) {
  const t = Date.parse(a.expiraEm);
  return !Number.isFinite(t) || t <= agora.getTime();
}

export function novaAutomacao(dados: Pick<AutomacaoAtiva, 'id' | 'tipo' | 'expiraEm' | 'referencia' | 'iniciadaPor'> & { estado?: EstadoAutomacao; mensagem?: AutomacaoAtiva['mensagem']; etapa?: AutomacaoAtiva['etapa']; programada?: AutomacaoAtiva['programada'] }, agora = new Date()): AutomacaoAtiva {
  const stamp = agora.toISOString();
  const estado = dados.estado ?? 'agendada';
  return {
    id: dados.id, tipo: dados.tipo, estado, criadaEm: stamp, atualizadaEm: stamp, expiraEm: dados.expiraEm, referencia: dados.referencia,
    iniciadaPor: dados.iniciadaPor, ...(dados.mensagem ? { mensagem: dados.mensagem } : {}), ...(dados.etapa ? { etapa: dados.etapa } : {}), ...(dados.programada ? { programada: dados.programada } : {}),
    historico: [{ em: stamp, estado, motivo: dados.iniciadaPor === 'equipe' ? 'iniciada pela equipe' : 'iniciada pela rotina' }],
  };
}

/** Acrescenta a automação uma única vez: o mesmo id (ativo ou encerrado) nunca é recriado. */
export function registrarAutomacao(lista: AutomacaoAtiva[] | undefined, nova: AutomacaoAtiva): AutomacaoAtiva[] {
  const atual = lista ?? [];
  if (atual.some(a => a.id === nova.id)) return atual;
  // Mantém as ativas e as encerradas mais recentes (histórico curto, sem crescer sem limite).
  const ativas = atual.filter(a => !automacaoFinal(a));
  const finais = atual.filter(a => automacaoFinal(a)).slice(-(LIMITE_AUTOMACOES - ativas.length - 1));
  return [...finais, ...ativas, nova];
}

/** Muda o estado respeitando a tabela de transições; estado final nunca reabre. Devolve a lista inalterada se proibido. */
export function transicionarAutomacao(lista: AutomacaoAtiva[] | undefined, id: string, estado: EstadoAutomacao, motivo: string, agora = new Date(), extra: Partial<Pick<AutomacaoAtiva, 'mensagem' | 'resultado' | 'etapa' | 'expiraEm'>> = {}): AutomacaoAtiva[] {
  const atual = lista ?? [];
  return atual.map(a => {
    if (a.id !== id || !TRANSICOES[a.estado].includes(estado)) return a;
    const stamp = agora.toISOString();
    return { ...a, ...extra, estado, atualizadaEm: stamp, historico: [...a.historico, { em: stamp, estado, motivo: motivo.slice(0, 160) }].slice(-LIMITE_HISTORICO) };
  });
}

export function podeTransicionar(a: Pick<AutomacaoAtiva, 'estado'>, estado: EstadoAutomacao) {
  return TRANSICOES[a.estado].includes(estado);
}

/** Expira automações vencidas (estado não final). */
export function expirarAutomacoes(lista: AutomacaoAtiva[] | undefined, agora = new Date()): AutomacaoAtiva[] {
  let atual = lista ?? [];
  for (const a of atual) if (!automacaoFinal(a) && automacaoVencida(a, agora)) atual = transicionarAutomacao(atual, a.id, 'expirada', 'validade encerrada', agora);
  return atual;
}

export function automacoesAtivas(lista: AutomacaoAtiva[] | undefined, agora = new Date()) {
  return (lista ?? []).filter(a => !automacaoFinal(a) && !automacaoVencida(a, agora));
}

export function automacoesAguardandoResposta(lista: AutomacaoAtiva[] | undefined, agora = new Date()) {
  return automacoesAtivas(lista, agora).filter(a => a.estado === 'aguardando_resposta');
}

/** Interpretação determinística da resposta (nunca pelo modelo). */
export type RespostaAutomacao =
  | { tipo: 'confirmar' }
  | { tipo: 'nao_pode' }
  | { tipo: 'escolha_horario'; texto: string }
  | { tipo: 'documento' };

export interface MensagemCliente {
  texto: string;
  arquivo?: string | undefined;
  /** Arquivo guardado pelo servidor (path + salvoStart). */
  temRecibo?: boolean | undefined;
}

type Interpretador = (m: MensagemCliente, a: AutomacaoAtiva) => RespostaAutomacao | undefined;

const INTERPRETADORES: Partial<Record<TipoAutomacao, Interpretador>> = {
  confirmacao_consulta: m => {
    if (m.arquivo) return undefined;
    const r = respostaConfirmacao40(m.texto);
    return r === 'sim' ? { tipo: 'confirmar' } : r === 'nao' ? { tipo: 'nao_pode' } : undefined;
  },
  lembrete_consulta: m => {
    if (m.arquivo) return undefined;
    const r = respostaLembreteAna(m.texto);
    return r === 'sim' ? { tipo: 'confirmar' } : r === 'nao' ? { tipo: 'nao_pode' } : undefined;
  },
  // Reagendamento: o próprio fluxo (reagendamento.ts) decide se o texto é escolha, aceite ou outra coisa.
  reagendamento: m => (m.arquivo ? undefined : { tipo: 'escolha_horario', texto: m.texto }),
  // Documento só conta com recibo do servidor; texto solto nunca é "documento recebido".
  solicitacao_documentos: m => (m.arquivo && m.temRecibo ? { tipo: 'documento' } : undefined),
};

export type Associacao =
  | { tipo: 'automacao'; automacao: AutomacaoAtiva; resposta: RespostaAutomacao }
  | { tipo: 'ambigua'; candidatas: AutomacaoAtiva[]; motivo: string }
  | { tipo: 'nenhuma'; motivo: string };

/**
 * Associa uma mensagem do cliente a uma automação só quando não há dúvida:
 * - a automação aguarda resposta e está dentro da validade;
 * - a mensagem enviada pela automação é a última do escritório no canal (ninguém da equipe escreveu depois);
 * - o interpretador determinístico do tipo reconhece a resposta;
 * - existe uma única automação aguardando (vários fluxos simultâneos → equipe).
 * Uma automação ativa nunca captura qualquer mensagem só por estar ativa.
 */
export function associarResposta(entrada: { automacoes: AutomacaoAtiva[] | undefined; mensagem: MensagemCliente; ultimaDoEscritorio: { idExterno?: string | undefined; texto?: string | undefined } | undefined; agora?: Date }): Associacao {
  const agora = entrada.agora ?? new Date();
  const aguardando = automacoesAguardandoResposta(entrada.automacoes, agora);
  if (!aguardando.length) return { tipo: 'nenhuma', motivo: 'nenhuma automação aguardando resposta' };
  const reconhecidas = aguardando.map(a => ({ a, r: INTERPRETADORES[a.tipo]?.(entrada.mensagem, a) })).filter((x): x is { a: AutomacaoAtiva; r: RespostaAutomacao } => !!x.r);
  const unica = reconhecidas[0];
  if (!unica) return { tipo: 'nenhuma', motivo: 'mensagem não reconhecida como resposta à automação' };
  // Parece resposta, mas há mais de um fluxo esperando: nunca escolher um deles por conta própria.
  if (aguardando.length > 1) return { tipo: 'ambigua', candidatas: aguardando, motivo: 'várias automações aguardando resposta ao mesmo tempo' };
  const enviada = unica.a.mensagem;
  const ultima = entrada.ultimaDoEscritorio;
  const ultimaEhDaAutomacao = !!ultima && !!enviada && (enviada.idExterno ? ultima.idExterno === enviada.idExterno : !!enviada.texto && ultima.texto === enviada.texto);
  if (!ultimaEhDaAutomacao) return { tipo: 'nenhuma', motivo: 'houve mensagem do escritório depois da automação' };
  return { tipo: 'automacao', automacao: unica.a, resposta: unica.r };
}

/** Controles da equipe no Atendimento. */
export type ControleAutomacao = 'pausar' | 'retomar' | 'cancelar';

export function controlarAutomacao(lista: AutomacaoAtiva[] | undefined, id: string, controle: ControleAutomacao, quem: string, agora = new Date()): { lista: AutomacaoAtiva[]; ok: boolean } {
  const alvo = (lista ?? []).find(a => a.id === id);
  if (!alvo || automacaoFinal(alvo)) return { lista: lista ?? [], ok: false };
  const motivo = `${controle === 'pausar' ? 'pausada' : controle === 'retomar' ? 'retomada' : 'cancelada'} por ${quem.slice(0, 60)}`;
  if (controle === 'pausar') {
    if (alvo.estado === 'pausada') return { lista: lista ?? [], ok: false };
    return { lista: transicionarAutomacao(lista, id, 'pausada', motivo, agora), ok: true };
  }
  if (controle === 'retomar') {
    if (alvo.estado !== 'pausada') return { lista: lista ?? [], ok: false };
    // Volta ao estado anterior à pausa (agendada ou aguardando resposta).
    const anterior = [...alvo.historico].reverse().find(h => h.estado !== 'pausada')?.estado;
    const destino: EstadoAutomacao = anterior === 'aguardando_resposta' ? 'aguardando_resposta' : 'agendada';
    return { lista: transicionarAutomacao(lista, id, destino, motivo, agora), ok: true };
  }
  return { lista: transicionarAutomacao(lista, id, 'cancelada', motivo, agora), ok: true };
}
