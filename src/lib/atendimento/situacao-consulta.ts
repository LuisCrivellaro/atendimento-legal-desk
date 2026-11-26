import type { Conversa } from '../mock-data';
import { registrarAviso } from './avisos-equipe';
import { dataOficial, horarioOficial } from './biblioteca/selecao';

/**
 * Situação da consulta: agendada, presença confirmada, realizada, ausência (faltou) ou cancelada.
 * Realizada e ausência só por registro da equipe (nunca porque o horário passou); cancelada por cancelamento
 * autorizado ou porque o compromisso foi concluído/excluído na agenda oficial (ProJuris, conferido pelo monitor).
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

/** Compromisso concluído/excluído na agenda oficial: consulta cancelada, lembretes e confirmações suspensos. */
export function registrarCancelamentoOficial<T extends Conversa>(c: T, motivo: string, agora = new Date()): T {
  const inicio = c.consultaAgendada;
  if (!inicio) return c;
  const stamp = agora.toISOString();
  return {
    ...c,
    consultaAgendada: undefined,
    horariosOfertados: [],
    agenteAna: { ...c.agenteAna, reservaCalendar: undefined, confirmacaoCancelamento: undefined, autorizacaoRemarcacao: undefined, alteracaoConsulta: undefined, situacaoConsulta: { inicio, estado: 'cancelada', em: stamp, por: 'agenda oficial' } },
    timeline: [...(c.timeline ?? []), { data: stamp, evento: `Consulta de ${dataOficial(inicio)} às ${horarioOficial(inicio)} cancelada: ${motivo}` }],
  };
}
