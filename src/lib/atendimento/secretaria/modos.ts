import type { AIMode } from '../../atendimento';
import type { Conversa } from '../../mock-data';
import type { ConfigSecretaria } from './config';
import { registrarAcao, type EstadoModo } from './estado';

/**
 * Modos de atuação da Anne por conversa.
 * - automatico: Anne conduz o atendimento e executa automações autorizadas (regras atuais de elegibilidade e origem).
 * - hibrido: a equipe conduz; Anne só executa automações autorizadas e responde dentro de uma automação ativa.
 * - humano: só a equipe envia; Anne pode gerar sugestões internas; nenhuma mensagem automática.
 * - bloqueado: nenhuma atuação (sem respostas, sugestões ou automações de saída).
 */
export type ModoAnne = 'automatico' | 'hibrido' | 'humano' | 'bloqueado';

export const MODOS: ModoAnne[] = ['automatico', 'hibrido', 'humano', 'bloqueado'];

export const ROTULOS_MODO: Record<ModoAnne, { titulo: string; descricao: string }> = {
  automatico: { titulo: 'Automático', descricao: 'Anne conduz o atendimento e executa as automações autorizadas.' },
  hibrido: { titulo: 'Híbrido', descricao: 'A equipe conduz; Anne executa só automações autorizadas e responde dentro delas.' },
  humano: { titulo: 'Humano', descricao: 'Só a equipe envia. Anne pode sugerir textos internos; nenhuma mensagem automática.' },
  bloqueado: { titulo: 'Bloqueado', descricao: 'Nenhuma atuação da Anne: sem respostas, sugestões ou automações.' },
};

const ORDEM: Record<ModoAnne, number> = { automatico: 0, hibrido: 1, humano: 2, bloqueado: 3 };

export function maisRestritivo(a: ModoAnne, b: ModoAnne): ModoAnne {
  return ORDEM[a] >= ORDEM[b] ? a : b;
}

type ConversaModo = Pick<Conversa, 'modoIA' | 'agenteAna'>;

/**
 * Migração dos estados antigos, sem gravar nada e sem reativar conversas desligadas:
 * pausa ou "Desligada" → bloqueado; "Sugerir" → humano; equipe no controle com falha registrada → humano
 * (a equipe confere antes de qualquer automação); equipe no controle → híbrido; restante → automático.
 */
export function derivarModoLegado(c: ConversaModo, modoPadrao: AIMode): ModoAnne {
  const legado = c.modoIA ?? modoPadrao;
  const a = c.agenteAna;
  if (a?.pausa || legado === 'Desligada') return 'bloqueado';
  if (legado === 'Sugerir') return 'humano';
  if (a?.humano && a.erro) return 'humano';
  if (a?.humano) return 'hibrido';
  return 'automatico';
}

export interface ModoCalculado {
  modo: ModoAnne;
  /** Modo derivado dos campos antigos (humano, pausa, modoIA, erro). */
  legado: ModoAnne;
  definido?: EstadoModo | undefined;
  motivo: string;
}

/**
 * Modo efetivo = o mais restritivo entre o modo definido e o derivado dos campos antigos.
 * Assim a equipe assumindo (humano: true) muda Automático para Híbrido, falhas e pausas continuam valendo,
 * Humano/Bloqueado definidos manualmente nunca são sobrescritos e nada volta sozinho para Automático.
 */
export function modoEfetivo(c: ConversaModo, modoPadrao: AIMode): ModoCalculado {
  const legado = derivarModoLegado(c, modoPadrao);
  const definido = c.agenteAna?.secretaria?.modo;
  if (!definido) return { modo: legado, legado, motivo: legado === 'automatico' ? 'Padrão da conversa.' : `Migrado do estado anterior da conversa (${ROTULOS_MODO[legado].titulo}).` };
  const modo = maisRestritivo(definido.modo, legado);
  if (modo === definido.modo) return { modo, legado, definido, motivo: definido.definidoPor === 'equipe' ? `Definido pela equipe${definido.autor ? ` (${definido.autor})` : ''}.` : definido.motivo ?? 'Definido por regra do sistema.' };
  const motivo = legado === 'hibrido' ? 'A equipe assumiu a conversa: Automático passou para Híbrido.'
    : c.agenteAna?.erro ? 'Falha registrada: a equipe confere antes de qualquer automação.'
      : legado === 'bloqueado' ? 'Anne pausada ou desligada nesta conversa.' : 'Estado anterior mais restritivo.';
  return { modo, legado, definido, motivo };
}

/** Campos antigos equivalentes ao modo: desligar a flag deixa a conversa num estado antigo coerente e seguro. */
export function camposLegados(modo: ModoAnne): { modoIA: AIMode; humano: boolean; pausa: boolean } {
  switch (modo) {
    case 'automatico': return { modoIA: 'Automática', humano: false, pausa: false };
    case 'hibrido': return { modoIA: 'Automática', humano: true, pausa: false };
    case 'humano': return { modoIA: 'Sugerir', humano: true, pausa: false };
    case 'bloqueado': return { modoIA: 'Desligada', humano: true, pausa: true };
  }
}

const PROXIMO_PASSO: Record<ModoAnne, string> = {
  automatico: 'Anne no modo Automático por decisão explícita da equipe.',
  hibrido: 'Modo Híbrido: a equipe conduz; Anne só executa automações autorizadas.',
  humano: 'Modo Humano: só a equipe envia; Anne pode sugerir textos internos.',
  bloqueado: 'Modo Bloqueado: Anne não atua nesta conversa.',
};

/**
 * Grava o modo e os campos antigos equivalentes. Sempre renova `controleHumanoEm`, o que invalida qualquer
 * resposta conversacional da Anne em andamento (conferida no envio por `autorizaEnvioAna`).
 * A equipe definindo o modo também limpa a falha registrada (ela conferiu), como o antigo "Retomar Anne".
 */
export function aplicarModo<T extends Conversa>(c: T, modo: ModoAnne, quem: { tipo: 'equipe' | 'sistema'; autor?: string | undefined }, agora = new Date(), motivo?: string): T {
  const stamp = agora.toISOString();
  const legados = camposLegados(modo);
  const estado: EstadoModo = { modo, definidoEm: stamp, definidoPor: quem.tipo, ...(quem.autor ? { autor: quem.autor.slice(0, 80) } : {}), ...(motivo ? { motivo: motivo.slice(0, 200) } : {}) };
  const agente = c.agenteAna ?? {};
  const texto = `Modo da Anne: ${ROTULOS_MODO[modo].titulo}${quem.tipo === 'equipe' ? ' (definido pela equipe)' : motivo ? ` (${motivo})` : ''}.`;
  return {
    ...c,
    modoIA: legados.modoIA,
    agenteAna: {
      ...agente,
      humano: legados.humano,
      pausa: legados.pausa,
      controleHumanoEm: stamp,
      ...(quem.tipo === 'equipe' ? { erro: undefined } : {}),
      proximoPasso: PROXIMO_PASSO[modo],
      secretaria: {
        ...agente.secretaria,
        modo: estado,
        acoes: registrarAcao(agente.secretaria?.acoes, { id: `modo:${stamp}`, em: stamp, funcionalidade: 'modo', resultado: 'executada', motivo: 'modo_alterado', texto }),
      },
    },
    timeline: [...(c.timeline ?? []), { data: stamp, evento: texto }],
  };
}

/**
 * Mensagem da equipe (Manager ou celular): Automático vira Híbrido; Híbrido, Humano e Bloqueado ficam como estão.
 * Os campos antigos (humano/controleHumanoEm) continuam sendo gravados pelo fluxo existente.
 */
export function aoIntervirEquipe<T extends Conversa>(c: T, modoPadrao: AIMode, agora = new Date()): T {
  const definido = c.agenteAna?.secretaria?.modo?.modo;
  if (definido && definido !== 'automatico') return c;
  if (!definido && derivarModoLegado({ ...c, agenteAna: { ...c.agenteAna, humano: false } }, modoPadrao) !== 'automatico') return c;
  return aplicarModo(c, 'hibrido', { tipo: 'sistema', autor: 'regra' }, agora, 'equipe assumiu a conversa');
}

/**
 * Regra configurável (desligada por padrão) de volta ao Automático: só quando o Híbrido veio da equipe assumindo
 * (nunca de uma escolha manual), sem falha, pausa, urgência ou aviso prioritário pendente, e sem mensagem da
 * equipe há `retornoAutomaticoHoras`.
 */
export function retornoAutomaticoDevido(c: Conversa, config: ConfigSecretaria, modoPadrao: AIMode, ultimaHumana: string | undefined, agora = new Date()) {
  if (config.retornoAutomaticoHoras === null || !ultimaHumana) return false;
  const calc = modoEfetivo(c, modoPadrao);
  if (calc.modo !== 'hibrido') return false;
  if (calc.definido && calc.definido.modo !== 'automatico' && calc.definido.definidoPor === 'equipe') return false;
  const a = c.agenteAna;
  if (a?.erro || a?.pausa || a?.urgente) return false;
  if ((c.avisosEquipe ?? []).some(x => !x.resolvidoEm && x.prioridade)) return false;
  const desde = Date.parse(ultimaHumana);
  return Number.isFinite(desde) && agora.getTime() - desde >= config.retornoAutomaticoHoras * 3600000;
}
