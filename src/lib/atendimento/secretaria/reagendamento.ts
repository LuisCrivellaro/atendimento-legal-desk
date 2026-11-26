import { formatarHorarioCliente } from '../../atendimento';
import { escolherHorarioAna, linhaHorarioAna, listaHorariosAna, pedidoHorarioEspecifico, pedidoHumano } from '../ana-scheduling';
import { textoAgendamentoConfirmado, textoReagendamentoHoje } from '../biblioteca/selecao';
import type { BibliotecaSalva } from '../biblioteca/renderizar';

/**
 * Reagendamento como automação de várias etapas, sem modelo (cliente avisou que não pode, faltou ou a equipe pediu):
 * 1. consulta a agenda oficial (só horários livres verificados);
 * 2. oferece as opções: modelo oficial 06 quando há dois horários HOJE; senão a lista aprovada do agendamento;
 * 3. reconhece a escolha (número, dia/horário); um horário fora da lista é conferido na agenda e, se livre, pede o aceite;
 * 4. remarca (reserva o novo antes de concluir o antigo; a reserva revalida a disponibilidade sob bloqueio);
 * 5. só comunica sucesso com o recibo da agenda, com a confirmação oficial (08.1 ou a aprovada com o link do Meet).
 * Nenhum texto é inventado: fora dos modelos oficiais, só frases já aprovadas no fluxo de agendamento da Anne.
 * Dúvida, pedido de pessoa ou falha vão para a equipe em silêncio (sem mensagem improvisada ao cliente).
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
  /** [nome] do cadastro, para os modelos oficiais (06). */
  nome?: string | undefined;
  /** Quem pediu: o cliente responde a uma pergunta; ausência/equipe é contato proativo. */
  origem?: 'cliente' | 'ausencia' | 'equipe' | undefined;
}

export type EventoReagendamento =
  | { tipo: 'agenda'; livres: string[]; agora?: Date | undefined }
  | { tipo: 'agenda_falhou' }
  | { tipo: 'mensagem'; texto: string; agora: Date }
  | { tipo: 'disponibilidade'; horario: string; livre: boolean }
  | { tipo: 'execucao'; ok: true; recibo: { id: string; inicio: string; meetUrl?: string | undefined }; agora?: Date | undefined }
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

/** Frases já aprovadas no fluxo de agendamento da Anne (ana.server.ts), reutilizadas sem alteração. */
export const FRASES_APROVADAS = {
  repetir: 'Qual dos horários enviados fica melhor para você?',
  indisponivel: 'Esse horário não está disponível.',
  falha: 'Não consegui concluir a reserva na agenda. Deixei a situação registrada para a equipe verificar; não considere o horário confirmado por esta mensagem.',
  mantida: (consulta: string) => `Combinado, sua consulta continua marcada para ${formatarHorarioCliente(consulta).toLowerCase()}.`,
  livre: (horario: string) => `${linhaHorarioAna(horario)} está livre. Posso marcar para você?`,
} as const;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SIM = /^(?:sim|s|pode|pode sim|sim pode|pode marcar|pode remarcar|confirmo|confirmado|confirma|ok|okay|isso|isso mesmo|fechado|combinado|perfeito)(?:[,!.\s]+(?:obrigad[oa]|por favor|pode))*[!.\s]*$/;
const NAO = /^(?:nao|n|nao quero|nao pode|melhor nao|outro|outro horario)[!.\s]*$/;
const MANTER = /\b(?:manter|mantem|mantenha|deixa como esta|deixa assim|desisti|nao precisa (?:mais )?remarcar|vou manter|fica como esta|continua (?:o )?mesmo|vou conseguir ir|consigo ir sim)\b/;

/** Texto das opções: modelo oficial 06 (dois horários hoje) ou a lista aprovada do agendamento. */
function oferta(estado: EstadoReagendamento, livres: string[], agora: Date, biblioteca?: BibliotecaSalva): { texto: string; opcoes: string[] } | undefined {
  const oficial = textoReagendamentoHoje(estado.nome, livres, agora, biblioteca);
  if (oficial) return { texto: oficial.texto, opcoes: oficial.opcoes };
  // Contato proativo depois de uma falta, sem dois horários hoje: não há texto oficial compatível (a equipe envia ou
  // aprova uma variante). Pedido do cliente ou delegação da equipe na conversa: lista aprovada do agendamento.
  if (estado.origem === 'ausencia') return undefined;
  const opcoes = livres.slice(0, MAX_OPCOES);
  return opcoes.length ? { texto: listaHorariosAna(opcoes), opcoes } : undefined;
}

export function listaOpcoes(opcoes: string[]) {
  return listaHorariosAna(opcoes);
}

export function iniciarReagendamento(consulta: { inicio: string; eventoId: string; nome?: string | undefined; origem?: EstadoReagendamento['origem'] }): { estado: EstadoReagendamento; acoes: AcaoReagendamento[] } {
  return {
    estado: { etapa: 'consultar_agenda', consultaAtual: consulta.inicio, eventoId: consulta.eventoId, opcoes: [], consultasAgenda: 0, naoReconhecidas: 0, ...(consulta.nome ? { nome: consulta.nome } : {}), ...(consulta.origem ? { origem: consulta.origem } : {}) },
    acoes: [{ tipo: 'consultar_agenda', evitar: [consulta.inicio] }],
  };
}

function encaminhar(estado: EstadoReagendamento, motivo: string, texto?: string): { estado: EstadoReagendamento; acoes: AcaoReagendamento[] } {
  return { estado: { ...estado, etapa: 'encaminhado' }, acoes: [{ tipo: 'encaminhar', motivo, ...(texto ? { texto } : {}) }] };
}

/**
 * Próximo passo. Eventos fora da etapa esperada são ignorados (sem ações): repetição de webhook ou de rotina
 * nunca dispara um segundo envio ou uma segunda remarcação.
 */
export function passoReagendamento(estado: EstadoReagendamento, evento: EventoReagendamento, biblioteca?: BibliotecaSalva): { estado: EstadoReagendamento; acoes: AcaoReagendamento[] } {
  const nada = { estado, acoes: [] as AcaoReagendamento[] };

  if (evento.tipo === 'agenda' || evento.tipo === 'agenda_falhou') {
    if (estado.etapa !== 'consultar_agenda') return nada;
    // Agenda fora do ar antes de qualquer oferta: nenhuma mensagem improvisada; a equipe é avisada.
    if (evento.tipo === 'agenda_falhou') return encaminhar(estado, 'agenda oficial indisponível');
    const livres = [...new Set(evento.livres)].filter(s => Date.parse(s) !== Date.parse(estado.consultaAtual)).sort((a, b) => Date.parse(a) - Date.parse(b));
    const o = oferta(estado, livres, evento.agora ?? new Date(), biblioteca);
    if (!o) {
      const motivo = livres.length ? 'sem dois horários livres hoje para o modelo oficial 06 (contato depois da falta): enviar manualmente ou aprovar uma variante' : 'sem horários livres verificados';
      // Cliente que pediu e não há horário: resposta aprovada do agendamento ("Não encontrei novas opções…").
      return encaminhar({ ...estado, consultasAgenda: estado.consultasAgenda + 1 }, motivo, !livres.length && estado.origem === 'cliente' ? listaHorariosAna([]) : undefined);
    }
    return { estado: { ...estado, etapa: 'aguardando_escolha', opcoes: o.opcoes, consultasAgenda: estado.consultasAgenda + 1, naoReconhecidas: 0 }, acoes: [{ tipo: 'enviar', texto: o.texto }] };
  }

  if (evento.tipo === 'disponibilidade') {
    if (estado.etapa !== 'aguardando_escolha') return nada;
    if (evento.livre) return { estado: { ...estado, etapa: 'aguardando_confirmacao', escolhido: evento.horario }, acoes: [{ tipo: 'enviar', texto: FRASES_APROVADAS.livre(evento.horario) }] };
    if (estado.consultasAgenda >= MAX_CONSULTAS_AGENDA) return encaminhar(estado, 'horários pedidos indisponíveis repetidamente');
    return { estado: { ...estado, etapa: 'consultar_agenda' }, acoes: [{ tipo: 'enviar', texto: FRASES_APROVADAS.indisponivel }, { tipo: 'consultar_agenda', evitar: [estado.consultaAtual, ...estado.opcoes] }] };
  }

  if (evento.tipo === 'execucao') {
    if (estado.etapa !== 'executando' || !estado.escolhido) return nada;
    if (evento.ok) {
      // Sucesso só com recibo coerente: mesmo horário escolhido e id do evento devolvido pela agenda.
      if (!evento.recibo.id || Date.parse(evento.recibo.inicio) !== Date.parse(estado.escolhido)) return encaminhar(estado, 'recibo da agenda divergente do horário escolhido', FRASES_APROVADAS.falha);
      // Confirmação oficial: 08.1 quando compatível (manhã, sem link a entregar); senão a confirmação aprovada com o link real.
      const confirmado = textoAgendamentoConfirmado(evento.recibo, estado.nome, evento.agora ?? new Date(), biblioteca ? { biblioteca } : undefined);
      return { estado: { ...estado, etapa: 'concluido', reciboNovo: { id: evento.recibo.id, inicio: evento.recibo.inicio } }, acoes: [{ tipo: 'concluir', texto: confirmado.texto, recibo: evento.recibo }] };
    }
    if (evento.indisponivel && estado.consultasAgenda < MAX_CONSULTAS_AGENDA) {
      return { estado: { ...estado, etapa: 'consultar_agenda', escolhido: undefined }, acoes: [{ tipo: 'enviar', texto: FRASES_APROVADAS.indisponivel }, { tipo: 'consultar_agenda', evitar: [estado.consultaAtual, estado.escolhido] }] };
    }
    return encaminhar(estado, evento.indisponivel ? 'horário ocupado repetidamente' : 'falha ao remarcar na agenda', FRASES_APROVADAS.falha);
  }

  // Mensagem do cliente.
  const t = fold(evento.texto);
  if (estado.etapa !== 'aguardando_escolha' && estado.etapa !== 'aguardando_confirmacao') return nada;
  if (pedidoHumano(evento.texto)) return encaminhar(estado, 'cliente pediu atendimento da equipe');
  if (MANTER.test(t)) return { estado: { ...estado, etapa: 'concluido' }, acoes: [{ tipo: 'concluir', texto: FRASES_APROVADAS.mantida(estado.consultaAtual), mantida: true }] };
  const executar = (para: string) => ({ estado: { ...estado, etapa: 'executando' as const, escolhido: para, naoReconhecidas: 0 }, acoes: [{ tipo: 'executar' as const, de: { eventoId: estado.eventoId, inicio: estado.consultaAtual }, para }] });
  if (estado.etapa === 'aguardando_confirmacao') {
    if (SIM.test(t) && estado.escolhido) return executar(estado.escolhido);
    const outra = escolherHorarioAna(estado.opcoes, evento.texto);
    if (outra) return executar(outra);
    if (NAO.test(t) && estado.opcoes.length) return { estado: { ...estado, etapa: 'aguardando_escolha', escolhido: undefined, naoReconhecidas: 0 }, acoes: [{ tipo: 'enviar', texto: FRASES_APROVADAS.repetir }] };
    return encaminhar(estado, 'aceite não reconhecido');
  }
  // Aguardando escolha: escolha clara de uma opção oferecida autoriza a remarcação (a reserva revalida a agenda).
  const escolhido = escolherHorarioAna(estado.opcoes, evento.texto);
  if (escolhido) return executar(escolhido);
  const especifico = pedidoHorarioEspecifico(evento.texto, evento.agora);
  if (especifico && Date.parse(especifico) > evento.agora.getTime()) return { estado, acoes: [{ tipo: 'consultar_horario', horario: especifico }] };
  if (estado.naoReconhecidas >= 1) return encaminhar(estado, 'escolha não reconhecida duas vezes');
  return { estado: { ...estado, naoReconhecidas: estado.naoReconhecidas + 1 }, acoes: [{ tipo: 'enviar', texto: FRASES_APROVADAS.repetir }] };
}
