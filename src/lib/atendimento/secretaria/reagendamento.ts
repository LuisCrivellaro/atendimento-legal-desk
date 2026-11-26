import { formatarHorarioCliente } from '../../atendimento';
import { escolherHorarioAna, opcaoHorarioAna, pedidoHorarioEspecifico, pedidoHumano } from '../ana-scheduling';
import { textoTemplate, type ChaveTemplate } from './templates';

/**
 * Reagendamento como automação de várias etapas, sem modelo:
 * 1. consulta a agenda oficial (só horários livres verificados);
 * 2. oferece as opções e reconhece a escolha (número, dia/horário) ou consulta um horário pedido;
 * 3. pede confirmação explícita do novo horário;
 * 4. executa a remarcação (reserva o novo antes de cancelar o antigo, no adaptador da agenda);
 * 5. só comunica sucesso com o recibo da agenda para o horário escolhido.
 * Qualquer dúvida, falha ou resposta não reconhecida vai para a equipe; nada é improvisado.
 */

export type EtapaReagendamento = 'consultar_agenda' | 'aguardando_escolha' | 'aguardando_confirmacao' | 'executando' | 'concluido' | 'encaminhado';

export interface EstadoReagendamento {
  etapa: EtapaReagendamento;
  /** Consulta atual com recibo (início e id do evento). */
  consultaAtual: string;
  eventoId: string;
  opcoes: string[];
  escolhido?: string | undefined;
  /** Quantas vezes a agenda foi consultada (limite contra loop). */
  consultasAgenda: number;
  /** Respostas não reconhecidas seguidas. */
  naoReconhecidas: number;
  reciboNovo?: { id: string; inicio: string } | undefined;
}

export type EventoReagendamento =
  | { tipo: 'agenda'; livres: string[] }
  | { tipo: 'agenda_falhou' }
  | { tipo: 'mensagem'; texto: string; agora: Date }
  | { tipo: 'disponibilidade'; horario: string; livre: boolean }
  | { tipo: 'execucao'; ok: true; recibo: { id: string; inicio: string; meetUrl?: string | undefined } }
  | { tipo: 'execucao'; ok: false; indisponivel: boolean };

export type AcaoReagendamento =
  | { tipo: 'consultar_agenda'; evitar: string[] }
  | { tipo: 'consultar_horario'; horario: string }
  | { tipo: 'enviar'; texto: string }
  | { tipo: 'executar'; de: { eventoId: string; inicio: string }; para: string }
  | { tipo: 'concluir'; texto: string; recibo?: { id: string; inicio: string; meetUrl?: string | undefined } | undefined; mantida?: boolean }
  | { tipo: 'encaminhar'; motivo: string; texto?: string | undefined };

export const MAX_CONSULTAS_AGENDA = 3;
export const MAX_OPCOES = 3;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SIM = /^(?:sim|s|pode|pode sim|sim pode|pode remarcar|confirmo|confirmado|confirma|ok|okay|isso|isso mesmo|fechado|combinado|perfeito)(?:[,!.\s]+(?:obrigad[oa]|por favor|pode))*[!.\s]*$/;
const NAO = /^(?:nao|n|nao quero|nao pode|melhor nao|outro|outro horario)[!.\s]*$/;
const MANTER = /\b(?:manter|mantem|mantenha|deixa como esta|deixa assim|desisti|nao precisa (?:mais )?remarcar|vou manter|fica como esta|continua (?:o )?mesmo)\b/;

function texto(chave: ChaveTemplate, dados: Record<string, string | undefined>, overrides?: Partial<Record<string, string>>) {
  const t = textoTemplate(chave, dados, overrides);
  return t.ok ? t.texto : undefined;
}

export function listaOpcoes(opcoes: string[]) {
  return opcoes.map((o, i) => `${i + 1}. ${opcaoHorarioAna(o)}`).join('\n');
}

export function iniciarReagendamento(consulta: { inicio: string; eventoId: string }): { estado: EstadoReagendamento; acoes: AcaoReagendamento[] } {
  return {
    estado: { etapa: 'consultar_agenda', consultaAtual: consulta.inicio, eventoId: consulta.eventoId, opcoes: [], consultasAgenda: 0, naoReconhecidas: 0 },
    acoes: [{ tipo: 'consultar_agenda', evitar: [consulta.inicio] }],
  };
}

function encaminhar(estado: EstadoReagendamento, motivo: string, chave?: ChaveTemplate, overrides?: Partial<Record<string, string>>): { estado: EstadoReagendamento; acoes: AcaoReagendamento[] } {
  const t = chave ? texto(chave, {}, overrides) : undefined;
  return { estado: { ...estado, etapa: 'encaminhado' }, acoes: [{ tipo: 'encaminhar', motivo, ...(t ? { texto: t } : {}) }] };
}

/**
 * Próximo passo. Eventos fora da etapa esperada são ignorados (sem ações): repetição de webhook ou de rotina
 * nunca dispara um segundo envio ou uma segunda remarcação.
 */
export function passoReagendamento(estado: EstadoReagendamento, evento: EventoReagendamento, overrides?: Partial<Record<string, string>>): { estado: EstadoReagendamento; acoes: AcaoReagendamento[] } {
  const nada = { estado, acoes: [] as AcaoReagendamento[] };
  const consulta = formatarHorarioCliente(estado.consultaAtual).toLowerCase();

  if (evento.tipo === 'agenda' || evento.tipo === 'agenda_falhou') {
    if (estado.etapa !== 'consultar_agenda') return nada;
    if (evento.tipo === 'agenda_falhou') return encaminhar(estado, 'agenda oficial indisponível', 'reagendamento_falha', overrides);
    const opcoes = [...new Set(evento.livres)].filter(s => Date.parse(s) !== Date.parse(estado.consultaAtual)).sort((a, b) => Date.parse(a) - Date.parse(b)).slice(0, MAX_OPCOES);
    if (!opcoes.length) return encaminhar({ ...estado, consultasAgenda: estado.consultasAgenda + 1 }, 'sem horários livres verificados', 'reagendamento_sem_opcoes', overrides);
    const t = texto('reagendamento_opcoes', { consulta, opcoes: listaOpcoes(opcoes) }, overrides);
    if (!t) return encaminhar(estado, 'modelo de mensagem incompleto');
    return { estado: { ...estado, etapa: 'aguardando_escolha', opcoes, consultasAgenda: estado.consultasAgenda + 1, naoReconhecidas: 0 }, acoes: [{ tipo: 'enviar', texto: t }] };
  }

  if (evento.tipo === 'disponibilidade') {
    if (estado.etapa !== 'aguardando_escolha') return nada;
    if (evento.livre) {
      const t = texto('reagendamento_confirmar', { novo: formatarHorarioCliente(evento.horario).toLowerCase() }, overrides);
      if (!t) return encaminhar(estado, 'modelo de mensagem incompleto');
      return { estado: { ...estado, etapa: 'aguardando_confirmacao', escolhido: evento.horario }, acoes: [{ tipo: 'enviar', texto: t }] };
    }
    if (estado.consultasAgenda >= MAX_CONSULTAS_AGENDA) return encaminhar(estado, 'horários pedidos indisponíveis repetidamente', 'reagendamento_sem_opcoes', overrides);
    const aviso = texto('reagendamento_indisponivel', {}, overrides);
    return { estado: { ...estado, etapa: 'consultar_agenda' }, acoes: [...(aviso ? [{ tipo: 'enviar' as const, texto: aviso }] : []), { tipo: 'consultar_agenda', evitar: [estado.consultaAtual, ...estado.opcoes] }] };
  }

  if (evento.tipo === 'execucao') {
    if (estado.etapa !== 'executando' || !estado.escolhido) return nada;
    if (evento.ok) {
      // Sucesso só com recibo coerente: mesmo horário escolhido e id do evento devolvido pela agenda.
      if (!evento.recibo.id || Date.parse(evento.recibo.inicio) !== Date.parse(estado.escolhido)) return encaminhar(estado, 'recibo da agenda divergente do horário escolhido', 'reagendamento_falha', overrides);
      const t = texto('reagendamento_sucesso', { novo: formatarHorarioCliente(evento.recibo.inicio).toLowerCase() }, overrides);
      const link = evento.recibo.meetUrl && /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(evento.recibo.meetUrl) ? `\n🔗 Link: ${evento.recibo.meetUrl}` : '';
      return { estado: { ...estado, etapa: 'concluido', reciboNovo: { id: evento.recibo.id, inicio: evento.recibo.inicio } }, acoes: [{ tipo: 'concluir', texto: `${t ?? ''}${link}`.trim(), recibo: evento.recibo }] };
    }
    if (evento.indisponivel && estado.consultasAgenda < MAX_CONSULTAS_AGENDA) {
      const aviso = texto('reagendamento_indisponivel', {}, overrides);
      return { estado: { ...estado, etapa: 'consultar_agenda', escolhido: undefined }, acoes: [...(aviso ? [{ tipo: 'enviar' as const, texto: aviso }] : []), { tipo: 'consultar_agenda', evitar: [estado.consultaAtual, estado.escolhido] }] };
    }
    return encaminhar(estado, evento.indisponivel ? 'horário ocupado repetidamente' : 'falha ao remarcar na agenda', 'reagendamento_falha', overrides);
  }

  // Mensagem do cliente.
  const t = fold(evento.texto);
  if (estado.etapa !== 'aguardando_escolha' && estado.etapa !== 'aguardando_confirmacao') return nada;
  if (pedidoHumano(evento.texto)) return encaminhar(estado, 'cliente pediu atendimento da equipe', 'encaminhado_equipe', overrides);
  if (MANTER.test(t)) {
    const m = texto('reagendamento_mantida', { consulta }, overrides);
    return { estado: { ...estado, etapa: 'concluido' }, acoes: [{ tipo: 'concluir', texto: m ?? '', mantida: true }] };
  }
  if (estado.etapa === 'aguardando_confirmacao') {
    if (SIM.test(t) && estado.escolhido) return { estado: { ...estado, etapa: 'executando' }, acoes: [{ tipo: 'executar', de: { eventoId: estado.eventoId, inicio: estado.consultaAtual }, para: estado.escolhido }] };
    const outra = escolherHorarioAna(estado.opcoes, evento.texto);
    if (outra && outra !== estado.escolhido) {
      const c = texto('reagendamento_confirmar', { novo: formatarHorarioCliente(outra).toLowerCase() }, overrides);
      if (!c) return encaminhar(estado, 'modelo de mensagem incompleto');
      return { estado: { ...estado, escolhido: outra }, acoes: [{ tipo: 'enviar', texto: c }] };
    }
    if (NAO.test(t)) {
      const o = texto('reagendamento_opcoes', { consulta, opcoes: listaOpcoes(estado.opcoes) }, overrides);
      if (!o) return encaminhar(estado, 'modelo de mensagem incompleto');
      return { estado: { ...estado, etapa: 'aguardando_escolha', escolhido: undefined, naoReconhecidas: 0 }, acoes: [{ tipo: 'enviar', texto: o }] };
    }
    return encaminhar(estado, 'confirmação não reconhecida', 'encaminhado_equipe', overrides);
  }
  // Aguardando escolha.
  const escolhido = escolherHorarioAna(estado.opcoes, evento.texto);
  if (escolhido) {
    const c = texto('reagendamento_confirmar', { novo: formatarHorarioCliente(escolhido).toLowerCase() }, overrides);
    if (!c) return encaminhar(estado, 'modelo de mensagem incompleto');
    return { estado: { ...estado, etapa: 'aguardando_confirmacao', escolhido, naoReconhecidas: 0 }, acoes: [{ tipo: 'enviar', texto: c }] };
  }
  const especifico = pedidoHorarioEspecifico(evento.texto, evento.agora);
  if (especifico && Date.parse(especifico) > evento.agora.getTime()) return { estado, acoes: [{ tipo: 'consultar_horario', horario: especifico }] };
  if (estado.naoReconhecidas >= 1) return encaminhar(estado, 'escolha não reconhecida duas vezes', 'encaminhado_equipe', overrides);
  const r = texto('reagendamento_repetir', {}, overrides);
  return { estado: { ...estado, naoReconhecidas: estado.naoReconhecidas + 1 }, acoes: r ? [{ tipo: 'enviar', texto: r }] : [] };
}
