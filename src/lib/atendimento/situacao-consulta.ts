import type { Conversa } from '../mock-data';
import { registrarAviso } from './avisos-equipe';
import { dataOficial, horarioOficial } from './biblioteca/selecao';

/**
 * Situação da consulta: agendada, presença confirmada, realizada, ausência (faltou) ou cancelada.
 * Realizada e ausência só por registro da equipe (nunca porque o horário passou); cancelada só por cancelamento
 * autorizado (cliente com a Anne ou equipe no Manager). Compromisso concluído/inexistente no ProJuris não prova
 * cancelamento: antes do horário, suspende as automações e pede conferência à equipe (`suspenderPorAgenda`).
 */

export type SituacaoConsulta = 'sem_consulta' | 'agendada' | 'confirmada' | 'realizada' | 'ausente' | 'cancelada';

export interface RegistroSituacao {
  inicio: string;
  estado: 'confirmada' | 'realizada' | 'ausente' | 'cancelada';
  em: string;
  por: string;
}

const FINAIS = ['realizada', 'ausente', 'cancelada'];
/** Duração da consulta e folga antes de pedir o registro à equipe. */
const DURACAO_MS = 30 * 60000;
const FOLGA_REGISTRO_MS = 60 * 60000;

export function situacaoConsulta(c: Pick<Conversa, 'consultaAgendada' | 'agenteAna'>): { estado: SituacaoConsulta; inicio?: string | undefined } {
  const reg = c.agenteAna?.situacaoConsulta;
  const inicio = c.consultaAgendada;
  if (reg && FINAIS.includes(reg.estado) && (!inicio || reg.inicio === inicio)) return { estado: reg.estado, inicio: reg.inicio };
  if (!inicio) return { estado: 'sem_consulta' };
  const a = c.agenteAna;
  const confirmada = (reg?.estado === 'confirmada' && reg.inicio === inicio)
    || (a?.confirmacao40?.inicio === inicio && a.confirmacao40.resposta === 'sim')
    || (a?.lembreteConsulta?.inicio === inicio && !!a.lembreteConsulta.confirmadoEm);
  return { estado: confirmada ? 'confirmada' : 'agendada', inicio };
}

/** Consulta cujo horário já terminou há mais de 1 h e ainda sem registro de realizada ou ausência. */
export function aguardaRegistro(c: Pick<Conversa, 'consultaAgendada' | 'agenteAna'>, agora = new Date()) {
  const s = situacaoConsulta(c);
  return (s.estado === 'agendada' || s.estado === 'confirmada') && !!s.inicio && agora.getTime() > Date.parse(s.inicio) + DURACAO_MS + FOLGA_REGISTRO_MS;
}

/** Aviso único para a equipe registrar o que aconteceu (nada é presumido). */
export function avisarRegistroPendente<T extends Conversa>(c: T, agora = new Date()): T {
  if (!aguardaRegistro(c, agora) || !c.consultaAgendada) return c;
  const inicio = c.consultaAgendada;
  return registrarAviso(c, { id: `registro-consulta:${inicio}`, tipo: 'confirmacao40', criadoEm: agora.toISOString(), texto: `A consulta de ${dataOficial(inicio)} às ${horarioOficial(inicio)} já passou: registre se foi realizada ou se o cliente faltou (a ausência inicia o reagendamento).` }, false);
}

/** Mesmo filtro da confirmação ao cliente (`mensagemConfirmacaoAna`, `textoAgendamentoConfirmado`): só esse link chega a ele. */
const LINK_MEET_ENTREGAVEL = /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i;
const PREFIXO_SEM_LINK = 'consulta-sem-link:';

/**
 * Consulta reservada sem link do Meet que o cliente possa receber (o Google não devolveu o link ou devolveu outro
 * endereço): aviso prioritário para a equipe criar a reunião e enviar o link antes do horário, um por horário.
 * Chamada sempre que um recibo novo é gravado; avisos de link de outros horários (consulta remarcada) deixam de valer.
 */
export function avisarConsultaSemLink<T extends Pick<Conversa, 'avisosEquipe' | 'timeline'>>(c: T, reserva: { inicio: string; meetUrl?: string | undefined }, agora = new Date()): T {
  const stamp = agora.toISOString();
  const id = `${PREFIXO_SEM_LINK}${reserva.inicio}`;
  const base: T = c.avisosEquipe?.some(a => a.id.startsWith(PREFIXO_SEM_LINK) && a.id !== id && !a.resolvidoEm)
    ? { ...c, avisosEquipe: c.avisosEquipe.map(a => a.id.startsWith(PREFIXO_SEM_LINK) && a.id !== id && !a.resolvidoEm ? { ...a, resolvidoEm: stamp, resolvidoPor: 'agenda (consulta mudou de horário)' } : a) }
    : c;
  if (LINK_MEET_ENTREGAVEL.test(reserva.meetUrl ?? '')) return base;
  return registrarAviso(base, { id, tipo: 'confirmacao40', prioridade: true, criadoEm: stamp, texto: `Consulta de ${dataOficial(reserva.inicio)} às ${horarioOficial(reserva.inicio)} marcada sem link do Meet: o Google não devolveu o link. Criar a reunião e enviar o link ao cliente antes do horário.` });
}

export type ErroRegistro = 'sem_consulta' | 'ainda_nao_comecou' | 'ja_registrada';

/** Registro da equipe. Realizada/ausência só depois do início da consulta. */
export function registrarSituacao<T extends Conversa>(c: T, estado: 'realizada' | 'ausente', por: string, agora = new Date()): { ok: true; conversa: T } | { ok: false; erro: ErroRegistro } {
  const s = situacaoConsulta(c);
  if (!s.inicio || s.estado === 'sem_consulta' || s.estado === 'cancelada') return { ok: false, erro: 'sem_consulta' };
  if (s.estado === 'realizada' || s.estado === 'ausente') return { ok: false, erro: 'ja_registrada' };
  if (agora.getTime() < Date.parse(s.inicio)) return { ok: false, erro: 'ainda_nao_comecou' };
  const stamp = agora.toISOString();
  const texto = estado === 'realizada' ? `Consulta de ${dataOficial(s.inicio)} às ${horarioOficial(s.inicio)} registrada como realizada` : `Cliente faltou à consulta de ${dataOficial(s.inicio)} às ${horarioOficial(s.inicio)} (registro da equipe)`;
  return {
    ok: true,
    conversa: {
      ...c,
      agenteAna: { ...c.agenteAna, situacaoConsulta: { inicio: s.inicio, estado, em: stamp, por: por.slice(0, 80) } },
      avisosEquipe: (c.avisosEquipe ?? []).map(a => a.id === `registro-consulta:${s.inicio}` && !a.resolvidoEm ? { ...a, resolvidoEm: stamp, resolvidoPor: por.slice(0, 80) } : a),
      timeline: [...(c.timeline ?? []), { data: stamp, evento: texto }],
    },
  };
}

/** Automações da consulta suspensas por conferência da agenda oficial. */
export function consultaSuspensa(c: Pick<Conversa, 'consultaAgendada' | 'agenteAna'>) {
  return !!c.consultaAgendada && c.agenteAna?.consultaSuspensa?.inicio === c.consultaAgendada;
}

/**
 * Compromisso concluído ou inexistente no ProJuris ANTES do horário. Concluído não prova cancelamento (nem realização
 * ou ausência): lembrete, confirmação e reagendamento ficam suspensos e a equipe decide (cancelar no Manager ou reabrir
 * o compromisso). Depois do início, nada muda aqui: vale o registro de realizada/ausência pela equipe.
 */
export function suspenderPorAgenda<T extends Conversa>(c: T, motivo: string, agora = new Date()): T {
  const inicio = c.consultaAgendada;
  if (!inicio || Date.parse(inicio) <= agora.getTime() || consultaSuspensa(c)) return c;
  const stamp = agora.toISOString();
  const quando = `${dataOficial(inicio)} às ${horarioOficial(inicio)}`;
  const suspensa: T = {
    ...c,
    agenteAna: { ...c.agenteAna, consultaSuspensa: { inicio, motivo: motivo.slice(0, 120), em: stamp } },
    timeline: [...(c.timeline ?? []), { data: stamp, evento: `Consulta de ${quando}: ${motivo}. Lembrete e confirmação suspensos até a equipe conferir.` }],
  };
  return registrarAviso(suspensa, { id: `agenda-suspensa:${inicio}`, tipo: 'projuris', prioridade: true, criadoEm: stamp, texto: `Consulta de ${quando}: ${motivo}. Nada foi enviado ao cliente. Se foi cancelada, cancele no Manager; se não, reabra o compromisso no ProJuris (as automações voltam sozinhas).` }, false);
}

/** Compromisso voltou a aparecer ativo no ProJuris: a suspensão deixa de valer. */
export function retomarPorAgenda<T extends Conversa>(c: T, agora = new Date()): T {
  if (!consultaSuspensa(c) || !c.consultaAgendada) return c;
  const inicio = c.consultaAgendada;
  const stamp = agora.toISOString();
  return {
    ...c,
    agenteAna: { ...c.agenteAna, consultaSuspensa: undefined },
    avisosEquipe: (c.avisosEquipe ?? []).map(a => a.id === `agenda-suspensa:${inicio}` && !a.resolvidoEm ? { ...a, resolvidoEm: stamp, resolvidoPor: 'agenda oficial (compromisso reaberto)' } : a),
    timeline: [...(c.timeline ?? []), { data: stamp, evento: `Compromisso da consulta de ${dataOficial(inicio)} às ${horarioOficial(inicio)} ativo de novo no ProJuris: automações retomadas.` }],
  };
}
