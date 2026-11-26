import type { Conversa } from '../mock-data';
import { dataAgenda, hora } from './ana-scheduling';
import { registrarAviso } from './avisos-equipe';
import { textoConfirmacaoDoDia } from './biblioteca/selecao';
import type { BibliotecaSalva } from './biblioteca/renderizar';

/**
 * Confirmação de presença antes da consulta (padrão 2 h, ver JANELA_CONFIRMACAO). Desde 26/11/2026 o envio automático usa a BIBLIOTECA OFICIAL
 * (modelo 02 de manhã, 08.2 a partir do meio-dia; ver biblioteca/selecao.ts). Este texto (aprovado em 25/11/2026,
 * saudação pelo horário do envio) continua na mensagem pronta /confirmar e como versão aprovada de reserva.
 * Mantém o espaço antes do "!" ("Bom dia ! 😊").
 */
export const MODELO_CONFIRMACAO_CONSULTA = 'Olá\n{saudacao} ! 😊\n📍Passando para confirmar o seu atendimento hoje às {horadaconsulta}, ok?!\nEquipe CS Advocacia ⚖️\nLawyers';

/**
 * Confirmação de presença: primeiro ciclo do monitor (a cada 5 min) em que faltam no máximo `antecedenciaMin`
 * (padrão 2 h, configurável pela equipe) e mais de 30 minutos. Nunca com 30 minutos ou menos (vira aviso).
 * O nome "confirmacao40" ficou nos campos por compatibilidade com conversas já gravadas.
 */
export const JANELA_CONFIRMACAO = { minimo: 30, maximo: 120 } as const;

/** Até quanto tempo depois do início uma resposta curta ainda vale como resposta à confirmação. */
const RESPOSTA_VALIDA_APOS_INICIO_MS = 60 * 60000;

function horaSP(agora: Date) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora);
  return Number(h);
}

/** "Bom dia" antes das 12h; "Boa tarde" das 12h às 17h59; "Boa noite" a partir das 18h (horário de São Paulo). */
export function saudacaoPorHorario(agora = new Date()) {
  const h = horaSP(agora);
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Texto final: saudação pelo horário do envio e hora da consulta no formato "14h" ou "14h30" (fuso de São Paulo). */
export function mensagemConfirmacaoConsulta(inicio: string, agora = new Date()) {
  return preencherConfirmacao(MODELO_CONFIRMACAO_CONSULTA, inicio, agora);
}

/** Preenche {saudacao} e {horadaconsulta}; outros campos ficam intactos para a equipe. */
export function preencherConfirmacao(texto: string, inicio: string, agora = new Date()) {
  return texto.replaceAll('{saudacao}', saudacaoPorHorario(agora)).replaceAll('{horadaconsulta}', hora(inicio));
}

export type FaseConfirmacao = 'cedo' | 'janela' | 'perdida' | 'passada';

/** Em que ponto a consulta está em relação à janela de confirmação (padrão: até 2 h antes, mais de 30 min). */
export function faseConfirmacao(inicio: string, agora = new Date(), antecedenciaMin: number = JANELA_CONFIRMACAO.maximo): FaseConfirmacao {
  const minutos = (Date.parse(inicio) - agora.getTime()) / 60000;
  if (!Number.isFinite(minutos) || minutos <= 0) return 'passada';
  if (minutos > Math.max(antecedenciaMin, JANELA_CONFIRMACAO.minimo + 5)) return 'cedo';
  if (minutos > JANELA_CONFIRMACAO.minimo) return 'janela';
  return 'perdida';
}

/** Consulta marcada para o dia corrente em São Paulo. */
export function consultaNoDia(inicio: string | undefined, agora = new Date()) {
  return !!inicio && Number.isFinite(Date.parse(inicio)) && dataAgenda(inicio) === dataAgenda(agora.toISOString());
}

export interface Confirmacao40 {
  inicio: string;
  /** Reservado antes da chamada ao canal: nunca reenviado, mesmo após falha ambígua. */
  reservadoEm?: string | undefined;
  enviadoEm?: string | undefined;
  idExterno?: string | undefined;
  /** Janela perdida, controle humano, sem vínculo ou sem recibo: aviso criado uma única vez para este horário. */
  avisadoEm?: string | undefined;
  falhouEm?: string | undefined;
  respondidoEm?: string | undefined;
  resposta?: 'sim' | 'nao' | undefined;
  /** Texto exato enviado (modelo oficial preenchido): usado para reconhecer a resposta sem recibo do canal. */
  texto?: string | undefined;
  /** Modelo da biblioteca usado no envio. */
  modelo?: { id: string; versao: number } | undefined;
}

/** Texto automático da confirmação de hoje: biblioteca oficial (02/08.2) ou, se nenhum servir, a versão aprovada anterior. */
export function textoConfirmacao40(inicio: string, agora = new Date(), biblioteca?: BibliotecaSalva) {
  const oficial = textoConfirmacaoDoDia(inicio, agora, biblioteca);
  return oficial && oficial.id !== 'anterior'
    ? { texto: oficial.texto, modelo: { id: oficial.id, versao: oficial.versao ?? 1 } }
    : { texto: mensagemConfirmacaoConsulta(inicio, agora), modelo: undefined };
}

/** Confirmação enviada para a consulta atual e ainda sem resposta do cliente. */
export function confirmacao40Ativa(c40: Confirmacao40 | undefined, consulta: string | undefined, agora = new Date()) {
  return !!c40?.enviadoEm && !c40.respondidoEm && !!consulta && c40.inicio === consulta && consultaNoDia(consulta, agora) && Date.parse(consulta) + RESPOSTA_VALIDA_APOS_INICIO_MS > agora.getTime();
}

/**
 * A resposta só conta como resposta à confirmação se a última mensagem do escritório no canal for a própria confirmação.
 * Assim um "sim" dado depois a outra pergunta (ex.: "quer mesmo cancelar?") nunca vira presença confirmada.
 */
export function confirmacao40Respondivel(c: Pick<Conversa, 'agenteAna' | 'consultaAgendada' | 'mensagens'>, canal: string, agora = new Date()) {
  const c40 = c.agenteAna?.confirmacao40;
  if (!c40 || !confirmacao40Ativa(c40, c.consultaAgendada, agora)) return false;
  const ultima = [...c.mensagens].reverse().find(m => m.de === 'escritorio' && (!m.canal || m.canal === canal));
  if (!ultima) return false;
  return c40.idExterno ? ultima.idExterno === c40.idExterno : ultima.texto === (c40.texto ?? mensagemConfirmacaoConsulta(c40.inicio, new Date(c40.enviadoEm ?? '')));
}

/** Grava a resposta uma única vez; "não" vira aviso prioritário para a equipe (consulta iminente). Nada é cancelado aqui. */
export function registrarRespostaConfirmacao40(x: Conversa, resposta: 'sim' | 'nao', agora = new Date()): Conversa {
  const c40 = x.agenteAna?.confirmacao40;
  if (!c40 || c40.respondidoEm) return x;
  const stamp = agora.toISOString();
  const marcado: Conversa = {
    ...x,
    agenteAna: { ...x.agenteAna, confirmacao40: { ...c40, respondidoEm: stamp, resposta } },
    timeline: [...x.timeline, { data: stamp, evento: resposta === 'sim' ? 'Presença confirmada pelo cliente na confirmação de presença' : 'Cliente respondeu à confirmação de presença que não vai conseguir, vai atrasar ou quer remarcar; nada foi cancelado' }],
  };
  if (resposta === 'sim') return marcado;
  return registrarAviso(marcado, {
    id: `confirmacao40-resposta:${c40.inicio}`, tipo: 'confirmacao40', prioridade: true, criadoEm: stamp,
    texto: `Consulta de hoje às ${hora(c40.inicio)} se aproxima e o cliente respondeu que não vai conseguir, vai atrasar ou quer remarcar. Nada foi cancelado; acompanhar com prioridade.`,
  }, false);
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Respostas curtas à confirmação. "sim" registra presença; "nao" nunca cancela: segue o fluxo de remarcação/cancelamento
 * com pergunta e resposta explícitas. Qualquer outra mensagem segue o fluxo normal da Anne.
 */
export function respostaConfirmacao40(texto: string): 'sim' | 'nao' | undefined {
  const t = fold(texto);
  if (!t || t.length > 80) return undefined;
  if (/\b(?:nao|n)\b|atras|remarc|reagend|desmarc|cancel|imprevist|nao vou|nao consigo|nao posso/.test(t)) return 'nao';
  if (/\?/.test(t)) return undefined;
  const semPontuacao = t
    .replace(/[\u{1f3fb}-\u{1f3ff}️‍]/gu, '')
    .replace(/[\u{1f44d}\u{1f44c}✅✔]/gu, ' positivo ')
    .replace(/[\u{1f60a}\u{1f642}☺\u{1f600}\u{1f601}\u{1f603}\u{1f604}\u{1f64f}\u{1fa75}\u{1f499}\u{1f49b}❤\u{1f970}\u{1f917}]/gu, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' emoji ')
    .replace(/[.!,;:\s]+/g, ' ').trim();
  const tokens = semPontuacao.split(' ').filter(Boolean);
  // Só palavras de confirmação; qualquer outra palavra (pergunta, assunto novo) segue o fluxo normal da Anne.
  const fortes = /^(?:ok+|okay|okey|sim|s|ss|claro|confirmo|confirmad[oa]|estarei|combinado|certo|beleza|blz|perfeito|positivo)$/;
  const neutras = /^(?:obrigad[oa]s?|obg|grat[oa]|valeu|doutora|dra|presenca|ai|la|vou|estar|tudo|ta|bom|otimo|pode|ser|isso|e|de|minha|a|o)$/;
  if (tokens.some(x => fortes.test(x)) && tokens.every(x => fortes.test(x) || neutras.test(x))) return 'sim';
  return undefined;
}

export type MotivoAvisoConfirmacao = 'perdida' | 'controle_humano' | 'sem_vinculo' | 'sem_recibo';

export type DecisaoConfirmacao =
  | { tipo: 'ignorar'; motivo: string }
  | { tipo: 'enviar'; inicio: string; texto: string; modelo?: { id: string; versao: number } | undefined }
  | { tipo: 'aviso'; inicio: string; motivo: MotivoAvisoConfirmacao; texto: string };

export interface EntradaConfirmacao {
  consultaAgendada?: string | undefined;
  reservaInicio?: string | undefined;
  confirmacao40?: Confirmacao40 | undefined;
  humano?: boolean | undefined;
  pausa?: boolean | undefined;
  /** Modo efetivo da conversa (conversa > automações do dono > padrão). */
  modo: 'Desligada' | 'Sugerir' | 'Automática';
  anaPausadaGlobal: boolean;
  automacaoLigada: boolean;
  /** Contato liberado e vinculado à conversa no canal UltraMsg. */
  contatoLiberado: boolean;
  /** Política anti-redundância (biblioteca/selecao.ts `politicaConsultaDia`): lembrete recente, presença já confirmada... */
  politica?: { permitido: true } | { permitido: false; motivo: string } | undefined;
  /** Versões aprovadas da biblioteca oficial salvas na área de trabalho. */
  biblioteca?: BibliotecaSalva | undefined;
  /** Antecedência configurada pela equipe (minutos; padrão 120). */
  antecedenciaMin?: number | undefined;
  /** Situação registrada da consulta: realizada, ausente ou cancelada nunca recebem confirmação. */
  situacao?: string | undefined;
}

/** Decide o que a rotina faz com uma consulta, sem efeitos. A rotina do servidor só executa a decisão. */
export function decidirConfirmacao40(e: EntradaConfirmacao, agora = new Date()): DecisaoConfirmacao {
  const inicio = e.consultaAgendada;
  if (!inicio || !consultaNoDia(inicio, agora)) return { tipo: 'ignorar', motivo: 'sem consulta hoje' };
  if (!e.automacaoLigada) return { tipo: 'ignorar', motivo: 'automação desligada' };
  if (e.confirmacao40?.inicio === inicio && (e.confirmacao40.reservadoEm || e.confirmacao40.avisadoEm)) return { tipo: 'ignorar', motivo: 'já tratada para este horário' };
  if (e.situacao === 'realizada' || e.situacao === 'ausente' || e.situacao === 'cancelada') return { tipo: 'ignorar', motivo: `consulta ${e.situacao}` };
  const fase = faseConfirmacao(inicio, agora, e.antecedenciaMin);
  if (fase === 'cedo') return { tipo: 'ignorar', motivo: 'fora da janela' };
  if (fase === 'passada') return { tipo: 'ignorar', motivo: 'consulta já começou' };
  // Confirmação redundante (presença já confirmada, lembrete recente, equipe já confirmou): não sai nem gera aviso.
  if (e.politica && !e.politica.permitido) return { tipo: 'ignorar', motivo: e.politica.motivo };
  const { texto, modelo } = textoConfirmacao40(inicio, agora, e.biblioteca);
  if (e.reservaInicio !== inicio) return { tipo: 'aviso', inicio, motivo: 'sem_recibo', texto };
  if (!e.contatoLiberado) return { tipo: 'aviso', inicio, motivo: 'sem_vinculo', texto };
  if (fase === 'perdida') return { tipo: 'aviso', inicio, motivo: 'perdida', texto };
  if (e.humano || e.pausa || e.anaPausadaGlobal || e.modo === 'Desligada') return { tipo: 'aviso', inicio, motivo: 'controle_humano', texto };
  return { tipo: 'enviar', inicio, texto, ...(modelo ? { modelo } : {}) };
}

/** Texto do aviso para a equipe (Atendimento e Assessor). */
export function textoAvisoConfirmacao(motivo: MotivoAvisoConfirmacao, inicio: string) {
  const h = hora(inicio);
  switch (motivo) {
    case 'perdida': return `Confirmação de presença não enviada (consulta às ${h}): confirmar por telefone.`;
    case 'controle_humano': return `Confirmação de presença da consulta das ${h} não foi enviada (modo da conversa, pausa ou permissão). Texto pronto para enviar com um clique.`;
    case 'sem_vinculo': return `Consulta de hoje às ${h} sem contato de WhatsApp liberado e vinculado: confirmação não enviada; confirmar por telefone.`;
    case 'sem_recibo': return `Consulta de hoje às ${h} sem recibo verificado da reserva: confirmação não enviada; conferir a agenda e confirmar por telefone.`;
  }
}
