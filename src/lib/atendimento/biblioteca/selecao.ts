import type { Conversa, Mensagem } from '../../mock-data';
import { mensagemConfirmacaoAna } from '../ana-scheduling';
import { origemMensagem } from '../secretaria/origem';
import { renderizarOficial, type BibliotecaSalva, type Renderizacao } from './renderizar';
import type { IdTemplate } from './mensagens-oficiais';

/**
 * A inteligência escolhe a situação; o texto vem da biblioteca. Cada função confere se o texto fixo combina com a
 * situação real (Bom dia, hoje, amanhã, presencial, link do Meet) e só preenche variáveis com dados verificados.
 * Quando o modelo oficial não combina, vale a versão aprovada anterior (quando existe) ou o envio é bloqueado.
 */

const TZ = 'America/Sao_Paulo';

function partes(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { dia: `${p['year']}-${p['month']}-${p['day']}`, data: `${p['day']}/${p['month']}/${p['year']}`, semana: String(p['weekday'] ?? '').toLowerCase(), hora: Number(p['hour']), minuto: p['minute'] ?? '00' };
}

/** "14h" ou "14h30" (São Paulo), igual às demais mensagens do escritório. */
export function horarioOficial(iso: string) {
  const p = partes(iso);
  return `${p.hora}h${p.minuto === '00' ? '' : p.minuto}`;
}
/** "26/11/2026". */
export function dataOficial(iso: string) { return partes(iso).data; }
/** "quinta-feira". */
export function diaDaSemana(iso: string) { return partes(iso).semana; }
export function mesmoDia(a: string | Date, b: string | Date) { return partes(a).dia === partes(b).dia; }
export function amanha(iso: string, agora = new Date()) { return partes(iso).dia === partes(new Date(agora.getTime() + 86400000)).dia; }
/** O texto diz "Bom dia": só antes das 12h em São Paulo. */
export function manha(agora = new Date()) { return partes(agora).hora < 12; }

const ROTULO_AUTOMATICO = /^whatsapp\s/i;

/**
 * [nome]: só do cadastro real (vínculo confirmado no ProJuris ou nome registrado no atendimento); nunca o rótulo do
 * WhatsApp nem o nome do perfil. Primeiro nome, com inicial maiúscula.
 */
export function nomeVerificado(c: Pick<Conversa, 'nome' | 'agenteAna' | 'nomePerfilWhatsApp'>): string | undefined {
  const vinculo = c.agenteAna?.vinculoProjuris?.status === 'confirmado' ? c.agenteAna.vinculoProjuris.nome : undefined;
  const conversa = c.nome && !ROTULO_AUTOMATICO.test(c.nome) && c.nome !== c.nomePerfilWhatsApp ? c.nome.replace(/^\s*(?:RT|AC)\s*-\s*[^-]*-\s*/i, '') : undefined;
  const fonte = [c.agenteAna?.dados?.nome, vinculo, conversa].find(n => !!n && n.trim().length >= 2);
  const primeiro = fonte?.trim().split(/\s+/)[0];
  if (!primeiro || !/^[\p{L}'-]{2,40}$/u.test(primeiro)) return undefined;
  return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR');
}

export interface Selecionado { id: IdTemplate | 'anterior'; versao?: number | undefined; texto: string }

/** Confirmação de presença do atendimento de hoje (padrão 2 h antes): 02 de manhã ("Bom dia"), 08.2 a partir do meio-dia. */
export function textoConfirmacaoDoDia(inicio: string, agora = new Date(), biblioteca?: BibliotecaSalva): Selecionado | undefined {
  if (!mesmoDia(inicio, agora)) return undefined;
  if (manha(agora)) {
    const r = renderizarOficial('T02', { '[horário]': horarioOficial(inicio) }, { biblioteca });
    if (r.ok) return { id: r.id, versao: r.versao, texto: r.texto };
  }
  const r = renderizarOficial('T08.2', { '[dia da semana]': diaDaSemana(inicio), '[data]': dataOficial(inicio), '[horário]': horarioOficial(inicio) }, { biblioteca });
  return r.ok ? { id: r.id, versao: r.versao, texto: r.texto } : undefined;
}

/** Lembrete do dia (01): consulta de hoje com recibo, de manhã ("Bom dia"), com nome do cadastro. */
export function textoLembreteDoDia(c: Pick<Conversa, 'nome' | 'agenteAna' | 'nomePerfilWhatsApp'>, inicio: string, agora = new Date(), biblioteca?: BibliotecaSalva): Renderizacao {
  if (!mesmoDia(inicio, agora)) return { ok: false, id: 'T01', motivo: 'incompativel', detalhe: 'Consulta não é hoje.' };
  if (!manha(agora)) return { ok: false, id: 'T01', motivo: 'incompativel', detalhe: 'O lembrete diz "Bom dia" e já passou do meio-dia.' };
  return renderizarOficial('T01', { '[nome]': nomeVerificado(c), '[horário]': horarioOficial(inicio) }, { biblioteca });
}

/**
 * Agendamento confirmado (08.1) só de manhã e quando não há link do Meet a entregar (o texto oficial não traz o
 * link). Nos demais casos vale a confirmação aprovada anterior, que leva data, horário e o link real.
 */
export function textoAgendamentoConfirmado(reserva: { inicio: string; meetUrl?: string | undefined }, nome: string | undefined, agora = new Date(), opcoes: { funilInternacional?: boolean; biblioteca?: BibliotecaSalva } = {}): Selecionado {
  const temLink = !!reserva.meetUrl && /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(reserva.meetUrl);
  if (!opcoes.funilInternacional && manha(agora) && !temLink) {
    const r = renderizarOficial('T08.1', { '[dia da semana]': diaDaSemana(reserva.inicio), '[data]': dataOficial(reserva.inicio), '[horário]': horarioOficial(reserva.inicio) }, { biblioteca: opcoes.biblioteca });
    if (r.ok) return { id: r.id, versao: r.versao, texto: r.texto };
  }
  return { id: 'anterior', texto: mensagemConfirmacaoAna(reserva.inicio, reserva.meetUrl, nome) };
}

/** Primeiro atendimento (07.1): lead novo que já disse o nome e dois horários reais amanhã. Senão, o texto atual. */
export function saudacaoPrimeiroAtendimento(atual: string, dados: { nome?: string | undefined; horarios: string[]; agora?: Date; biblioteca?: BibliotecaSalva }): Selecionado {
  const agora = dados.agora ?? new Date();
  const [h1, h2] = [...dados.horarios].sort((a, b) => Date.parse(a) - Date.parse(b));
  const nome = dados.nome?.trim().split(/\s+/)[0];
  if (dados.horarios.length === 2 && h1 && h2 && nome && amanha(h1, agora) && amanha(h2, agora)) {
    const n = nome.charAt(0).toLocaleUpperCase('pt-BR') + nome.slice(1).toLocaleLowerCase('pt-BR');
    const r = renderizarOficial('T07.1', { '[nome]': n, '[dia da semana]': diaDaSemana(h1), '[horário 1]': horarioOficial(h1), '[horário 2]': horarioOficial(h2) }, { biblioteca: dados.biblioteca });
    if (r.ok) return { id: r.id, versao: r.versao, texto: r.texto };
  }
  return { id: 'anterior', texto: atual };
}

/** Reagendamento (06): só com dois horários livres HOJE e nome do cadastro. Devolve o texto e as duas opções. */
export function textoReagendamentoHoje(nome: string | undefined, livres: string[], agora = new Date(), biblioteca?: BibliotecaSalva): (Selecionado & { opcoes: [string, string] }) | undefined {
  const hoje = [...livres].filter(s => mesmoDia(s, agora) && Date.parse(s) > agora.getTime()).sort((a, b) => Date.parse(a) - Date.parse(b));
  const [h1, h2] = hoje;
  if (!h1 || !h2 || !nome) return undefined;
  const r = renderizarOficial('T06', { '[nome]': nome, '[horário 1]': horarioOficial(h1), '[horário 2]': horarioOficial(h2) }, { biblioteca });
  return r.ok ? { id: r.id, versao: r.versao, texto: r.texto, opcoes: [h1, h2] } : undefined;
}

/** Pedido do Instagram ou do LinkedIn (10.1 / 10.2): só quando a mensagem é esse pedido. */
export function pedidoRedeSocial(texto: string): 'T10.1' | 'T10.2' | undefined {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Mensagem curta e só sobre o perfil; quem cita a rede no meio de um pedido de atendimento segue o fluxo normal.
  if (t.length > 100 || /\b(?:consulta|processo|demiti|demissao|agendar|marcar|preciso|ajuda|caso|direito)/.test(t)) return undefined;
  const rede = /\blinked\s?in\b/.test(t) ? 'T10.2' as const : /\b(?:instagram|insta|ig)\b/.test(t) ? 'T10.1' as const : undefined;
  if (!rede) return undefined;
  const nome = rede === 'T10.2' ? 'linked\\s?in' : '(?:instagram|insta|ig)';
  const antes = new RegExp(`\\b(?:qual|quais|tem|teria|manda|mande|passa|passe|envia|envie|segui\\w*|perfil|link|endereco|onde)\\b[^.!?]{0,30}\\b${nome}\\b`);
  const depois = new RegExp(`\\b${nome}\\b[^.!]{0,30}\\?`);
  return antes.test(t) || depois.test(t) ? rede : undefined;
}

/** Período fora do expediente (seg–sex 8h–18h): chave = início do próximo expediente; undefined dentro do expediente. */
export function periodoForaExpediente(agora = new Date()): string | undefined {
  const p = partes(agora);
  const util = (d: Date) => !['sábado', 'domingo'].includes(partes(d).semana);
  if (util(agora) && p.hora >= 8 && p.hora < 18) return undefined;
  for (let i = 0; i < 8; i++) {
    const d = new Date(agora.getTime() + i * 86400000);
    if (!util(d)) continue;
    const abertura = new Date(`${partes(d).dia}T08:00:00-03:00`);
    if (abertura.getTime() > agora.getTime()) return abertura.toISOString();
  }
  return undefined;
}

/** Cliente ativo fora do expediente (03): uma vez por período, com a automação ligada. */
export function textoForaDoHorario(periodoJaAvisado: string | undefined, agora = new Date(), biblioteca?: BibliotecaSalva): (Selecionado & { periodo: string }) | undefined {
  const periodo = periodoForaExpediente(agora);
  if (!periodo || periodoJaAvisado === periodo) return undefined;
  const r = renderizarOficial('T03', {}, { biblioteca });
  return r.ok ? { id: r.id, versao: r.versao, texto: r.texto, periodo } : undefined;
}

export interface EventoParaComunicar {
  tipo: 'audiencia' | 'pericia';
  data?: string | undefined;
  hora?: string | undefined;
  modalidade?: string | undefined;
  tipoAudiencia?: string | undefined;
  numero?: string | undefined;
  vara?: string | undefined;
  local?: string | undefined;
}

/**
 * Rascunho para a revisora (11.1 audiência / 12.1 perícia) com os dados do registro. Campo sem dado fica visível
 * entre colchetes para a revisão completar; nada sai ao cliente enquanto houver variável pendente.
 */
export function rascunhoComunicacaoEvento(e: EventoParaComunicar, nome: string | undefined, biblioteca?: BibliotecaSalva): { texto: string; id: IdTemplate; versao: number; faltando: string[] } {
  const modalidade = e.modalidade ? (/presencial/i.test(e.modalidade) ? 'presencial' : /online|on-line|virtual|telepresencial|video/i.test(e.modalidade) ? 'online' : e.modalidade) : undefined;
  const r = e.tipo === 'audiencia'
    ? renderizarOficial('T11.1', { '[nome]': nome, '[data]': e.data, '[horário]': e.hora, '[presencial/online]': modalidade, '[tipo de audiência]': e.tipoAudiencia, '[número]': e.numero, '[vara responsável]': e.vara, '[Endereço ou link]': e.local }, { biblioteca, exigirAtivo: false, deixarPendentes: true })
    : renderizarOficial('T12.1', { '[data]': e.data, '[horário]': e.hora, '[endereço completo]': e.local }, { biblioteca, exigirAtivo: false, deixarPendentes: true });
  if (!r.ok) return { texto: '', id: r.id, versao: 1, faltando: r.faltando ?? [] };
  return { texto: r.texto, id: r.id, versao: r.versao, faltando: [...new Set([...r.texto.matchAll(/\[[^\[\]\n]{1,60}\]/g)].map(m => m[0]))] };
}

/**
 * Política anti-redundância dos modelos 01, 02 e 08.2 (um lembrete e uma confirmação por consulta, no máximo):
 * - lembrete: não repete; não sai se a confirmação já saiu ou se a equipe já avisou hoje com o horário da consulta;
 * - confirmação: não repete; não sai se o cliente já confirmou presença, se o lembrete saiu há menos de 90 min ou se
 *   a equipe já mandou mensagem equivalente nas últimas 3 h.
 */
export function politicaConsultaDia(c: Pick<Conversa, 'agenteAna' | 'mensagens'>, inicio: string, tipo: 'lembrete' | 'confirmacao', agora = new Date()): { permitido: true } | { permitido: false; motivo: string } {
  const a = c.agenteAna;
  const h = horarioOficial(inicio);
  // Comunicação equivalente recente: mensagem da equipe sobre a consulta ou confirmação de agendamento/remarcação
  // (da equipe ou da Anne) com o horário da consulta.
  const equipeAvisou = (desdeMs: number) => c.mensagens.some((m: Mensagem) => m.de === 'escritorio' && Date.parse(m.dataHora ?? '') >= desdeMs && mesmoDia(m.dataHora ?? agora, agora) && m.texto.includes(h)
    && ((origemMensagem(m) === 'equipe' && /lembr|confirm|consulta|atendimento/i.test(m.texto)) || /\bagendad|\bremarcad/i.test(m.texto)));
  if (tipo === 'lembrete') {
    if (a?.lembreteConsulta?.inicio === inicio) return { permitido: false, motivo: 'lembrete já enviado para esta consulta' };
    if (a?.confirmacao40?.inicio === inicio && (a.confirmacao40.enviadoEm || a.confirmacao40.reservadoEm)) return { permitido: false, motivo: 'confirmação já enviada para esta consulta' };
    if (equipeAvisou(agora.getTime() - 12 * 3600000)) return { permitido: false, motivo: 'a equipe já avisou o cliente hoje' };
    return { permitido: true };
  }
  if (a?.confirmacao40?.inicio === inicio && (a.confirmacao40.enviadoEm || a.confirmacao40.reservadoEm)) return { permitido: false, motivo: 'confirmação já enviada para esta consulta' };
  const l = a?.lembreteConsulta;
  if (l?.inicio === inicio && l.confirmadoEm) return { permitido: false, motivo: 'cliente já confirmou presença pelo lembrete' };
  if (a?.situacaoConsulta?.inicio === inicio && a.situacaoConsulta.estado === 'confirmada') return { permitido: false, motivo: 'presença já confirmada' };
  if (l?.inicio === inicio && agora.getTime() - Date.parse(l.enviadoEm) < 90 * 60000) return { permitido: false, motivo: 'lembrete do dia enviado há menos de 90 minutos' };
  if (equipeAvisou(agora.getTime() - 3 * 3600000)) return { permitido: false, motivo: 'a equipe já confirmou com o cliente' };
  return { permitido: true };
}

/** Marca de uso gravada na mensagem enviada (histórico de utilização do modelo). */
export function marcaModelo(s: Selecionado): { id: string; versao: number } | undefined {
  return s.id === 'anterior' ? undefined : { id: s.id, versao: s.versao ?? 1 };
}
