// Agenda oficial da Anne: exclusivamente o ProJuris ADV (decisão da Dra. Carolina em 04/11/2026).
// Disponibilidade, reserva, remarcação e cancelamento usam só compromissos do ProJuris.
// O Google Calendar NÃO é mais consultado para disponibilidade nem usado como agenda:
// resta apenas um evento mínimo para gerar o link do Google Meet (o Meet não existe sem evento do Google).
// Recibos antigos (id de evento do Google) continuam legíveis/canceláveis pelo módulo legado até a migração.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { idReservaCalendar, type ReservaCalendar } from './calendar-booking';
import { DURACAO_REUNIAO, horarioPermitido } from './schedule-rules';
import { telefoneAgenda, type TipoCliente } from './intake-rules';
import {
  listarCompromissos,
  obterCompromisso,
  reservarCompromisso,
  alterarHorarioCompromisso,
  concluirCompromisso,
  type ClienteAgenda,
} from '../projuris/agenda.server';
import { codigoExternoConsulta, eventoDeDto, PREFIXO_EXTERNO_MANAGER } from '../projuris/agenda';

type Db = SupabaseClient<Database>;

/** Portas externas substituíveis nos testes; em produção usam os módulos reais. */
export interface PortasAgenda {
  cliente?: ClienteAgenda;
  criarMeet?: (inicio: string, fim: string, titulo: string, descricao: string) => Promise<{ id: string; meetUrl?: string | undefined }>;
  apagarMeet?: (id: string) => Promise<void>;
  legado?: {
    ler: (conversaId: string, reserva: ReservaCalendar) => Promise<ReservaCalendar | undefined>;
    cancelar: (conversaId: string, reserva: ReservaCalendar, autorizado: boolean) => Promise<'cancelado' | 'ausente'>;
    remarcar: (conversaId: string, anterior: ReservaCalendar, inicio: string, autorizado: boolean, now: Date, cliente?: { nome: string; telefone: string; tipo: TipoCliente }) => Promise<ReservaCalendar>;
  };
}

async function resolverPortas(p: PortasAgenda): Promise<Required<Omit<PortasAgenda, 'cliente'>> & { cliente: ClienteAgenda | undefined }> {
  const google = await import('./google-calendar.server');
  return {
    cliente: p.cliente,
    criarMeet: p.criarMeet ?? google.criarEventoMeet,
    apagarMeet: p.apagarMeet ?? google.apagarEventoMeet,
    legado: p.legado ?? { ler: google.lerReservaGoogleCalendar, cancelar: google.cancelarGoogleCalendar, remarcar: google.remarcarGoogleCalendar },
  };
}

/** Recibos da agenda oficial têm id "pj:{código do compromisso}"; qualquer outro formato é recibo legado do Google. */
export const idReciboProjuris = (codigo: number) => `pj:${codigo}`;
const codigoDoRecibo = (id: string): number | undefined => {
  const m = /^pj:(\d+)$/.exec(id);
  const n = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

/** Períodos ocupados da agenda oficial (ProJuris). Retorna null se indisponível — nunca oferecer horário sem leitura. */
export async function ocupadosAgenda(db: Db, owner: string, now = new Date(), dias = 14, portas: PortasAgenda = {}): Promise<{ start: string; end: string }[] | null> {
  void db; void owner; // a leitura não usa o banco; a assinatura acompanha as operações de escrita
  try {
    const compromissos = await listarCompromissos(now.getTime(), now.getTime() + dias * 86400000, portas.cliente);
    return compromissos.map(c => ({ start: new Date(c.inicioMs).toISOString(), end: new Date(c.fimMs).toISOString() }));
  } catch (e) {
    // ProJuris é a agenda principal e é sempre consultado primeiro; só na falha o Google Agenda serve de reserva.
    console.error('Agenda ProJuris indisponível; usando o Google Agenda como reserva', e);
    if (portas.cliente) return null; // testes com dublê não consultam o Google
    const { ocupadosGoogleCalendar } = await import('./google-calendar.server');
    return ocupadosGoogleCalendar(now, dias);
  }
}

/** O compromisso pertence a este atendimento: origem Manager ADV e horários idênticos aos do recibo salvo na conversa. */
function compromissoDoAtendimento(dto: Record<string, unknown>, reserva: ReservaCalendar): boolean {
  const externo = typeof dto['codigoExterno'] === 'string' ? dto['codigoExterno'] : '';
  if (!externo.startsWith(PREFIXO_EXTERNO_MANAGER)) return false;
  const ev = eventoDeDto(dto);
  return !!ev && ev['dataHoraInicio'] === Date.parse(reserva.inicio) && ev['dataHoraFim'] === Date.parse(reserva.fim);
}

/**
 * Reserva a consulta na agenda oficial (ProJuris) com lease, releitura, idempotência por codigoExterno
 * e confirmação por leitura (reservarCompromisso). O evento do Google é criado antes, só pelo link do Meet;
 * se a reserva oficial falhar, esse evento é removido. Se o Meet falhar, a reserva oficial continua e a
 * equipe é avisada para enviar o link — a confirmação nunca inventa link.
 */
export async function reservarAgenda(
  db: Db,
  owner: string,
  conversaId: string,
  inicio: string,
  now = new Date(),
  cliente?: { nome: string; telefone: string; tipo: TipoCliente },
  portas: PortasAgenda = {},
): Promise<ReservaCalendar> {
  if (!conversaId || !Number.isFinite(Date.parse(inicio)) || Date.parse(inicio) <= now.getTime()) throw new Error('Escolha um horário futuro disponível.');
  if (!cliente?.nome.trim() || !telefoneAgenda(cliente.telefone)) throw new Error('Informe nome e telefone do cliente antes de reservar.');
  if (!horarioPermitido(inicio, cliente.tipo)) throw new Error('Horário fora da carteira de atendimento permitida.');
  inicio = new Date(inicio).toISOString();
  const fim = new Date(Date.parse(inicio) + DURACAO_REUNIAO * 60000).toISOString();
  const p = await resolverPortas(portas);

  const titulo = `Consulta CS Lawyers · ${cliente.nome.trim()}`;
  // 1. Link do Meet (evento mínimo no Google, só para o link). Falha aqui não impede a reserva oficial.
  let meet: { id: string; meetUrl?: string | undefined } | undefined;
  try {
    meet = await p.criarMeet(inicio, fim, titulo, `Reunião online da consulta agendada pela Anne.\nCliente: ${cliente.nome.trim()}\nTelefone: ${telefoneAgenda(cliente.telefone)}`);
  } catch (e) {
    console.error('Meet indisponível; reserva oficial continua sem link', e);
  }

  // 2. Reserva oficial no ProJuris (com o link do Meet na descrição, quando gerado).
  const descricao = [
    `Nome: ${cliente.nome.trim()}`,
    `Telefone: ${telefoneAgenda(cliente.telefone)}`,
    `Reunião: ${DURACAO_REUNIAO} minutos`,
    meet?.meetUrl ? `Link da reunião (Google Meet): ${meet.meetUrl}` : 'Link da reunião: a equipe envia antes da consulta.',
    'Agendada pela Anne (assistente virtual) no Manager ADV.',
  ].join('\n');
  const codigoExterno = codigoExternoConsulta(conversaId, Date.parse(inicio));
  let resultado: Awaited<ReturnType<typeof reservarCompromisso>>;
  try {
    resultado = await reservarCompromisso(db, owner, { titulo, inicioMs: Date.parse(inicio), fimMs: Date.parse(fim), codigoExterno, descricao }, p.cliente);
  } catch (e) {
    // ProJuris fora (credencial/bloqueio/rede) antes de gravar: o evento do Google vale como reserva provisória.
    const tipo = (e as { tipo?: string }).tipo;
    if (meet && !portas.cliente && (tipo === 'autenticacao' || tipo === 'configuracao' || tipo === 'indisponivel')) {
      console.error('ProJuris indisponível; consulta reservada no Google Agenda e pendente no ProJuris', e);
      return { id: meet.id, inicio, fim, ...(meet.meetUrl ? { meetUrl: meet.meetUrl } : {}), pendenteProjuris: { titulo, descricao, codigoExterno } };
    }
    if (meet) await p.apagarMeet(meet.id).catch(() => undefined);
    throw e;
  }

  if (!resultado.ok) {
    // A reserva oficial falhou: remover o evento-companheiro do Meet para não deixar órfão na agenda do Google.
    if (meet) await p.apagarMeet(meet.id).catch(() => undefined);
    if (resultado.motivo === 'conflito') throw new Error('Esse horário acabou de ficar ocupado. Escolha outro horário.');
    if (resultado.motivo === 'ocupado') throw new Error('A agenda está em uso por outra operação. Tente novamente em instantes.');
    throw new Error(`Reserva não confirmada no ProJuris (${resultado.motivo})${resultado.detalhe ? `: ${resultado.detalhe}` : ''}`);
  }
  return { id: idReciboProjuris(resultado.codigo), inicio, fim, ...(meet?.meetUrl ? { meetUrl: meet.meetUrl } : {}) };
}

/** Relê o recibo na agenda oficial; recibos legados do Google seguem pelo módulo antigo até a migração. */
export async function lerReservaAgenda(db: Db, owner: string, conversaId: string, reserva: ReservaCalendar, portas: PortasAgenda = {}): Promise<ReservaCalendar | undefined> {
  const codigo = codigoDoRecibo(reserva.id);
  const p = await resolverPortas(portas);
  if (codigo === undefined) return p.legado.ler(conversaId, reserva);
  const dto = await obterCompromisso(codigo, p.cliente);
  if (!dto || eventoDeDto(dto)!['concluido'] === true || !compromissoDoAtendimento(dto, reserva)) return undefined;
  return { id: reserva.id, inicio: reserva.inicio, fim: reserva.fim, ...(reserva.meetUrl ? { meetUrl: reserva.meetUrl } : {}) };
}

/** Cancelamento = concluir o compromisso (exclusão é proibida no ProJuris). Exige autorização explícita. */
export async function cancelarAgenda(db: Db, owner: string, conversaId: string, reserva: ReservaCalendar, autorizado: boolean, portas: PortasAgenda = {}): Promise<'cancelado' | 'ausente'> {
  if (!autorizado) throw new Error('Cancelamento exige autorização explícita.');
  const codigo = codigoDoRecibo(reserva.id);
  const p = await resolverPortas(portas);
  if (codigo === undefined) return p.legado.cancelar(conversaId, reserva, autorizado);
  const dto = await obterCompromisso(codigo, p.cliente);
  if (!dto || !compromissoDoAtendimento(dto, reserva)) throw new Error('Compromisso não pertence a este atendimento.');
  if (eventoDeDto(dto)!['concluido'] === true) return 'ausente';
  const resultado = await concluirCompromisso(db, owner, codigo, p.cliente);
  if (!resultado.ok) {
    if (resultado.motivo === 'ausente') return 'ausente';
    throw new Error(`Cancelamento não confirmado no ProJuris (${resultado.motivo})${resultado.detalhe ? `: ${resultado.detalhe}` : ''}`);
  }
  // Remove o evento-companheiro do Meet (id determinístico por horário), sem bloquear o cancelamento.
  await p.apagarMeet(await idReservaCalendar(reserva.inicio)).catch(() => undefined);
  return 'cancelado';
}

/** Reserva o novo horário antes de concluir o anterior; falha na conclusão desfaz a nova reserva. */
export async function remarcarAgenda(
  db: Db,
  owner: string,
  conversaId: string,
  anterior: ReservaCalendar,
  inicio: string,
  autorizado: boolean,
  now = new Date(),
  cliente?: { nome: string; telefone: string; tipo: TipoCliente },
  portas: PortasAgenda = {},
): Promise<ReservaCalendar> {
  if (!autorizado) throw new Error('Remarcação exige autorização explícita.');
  const codigo = codigoDoRecibo(anterior.id);
  const p = await resolverPortas(portas);
  if (codigo === undefined) return p.legado.remarcar(conversaId, anterior, inicio, autorizado, now, cliente);
  const dto = await obterCompromisso(codigo, p.cliente);
  if (!dto || eventoDeDto(dto)!['concluido'] === true || !compromissoDoAtendimento(dto, anterior)) throw new Error('Consulta original indisponível para remarcação.');
  if (Date.parse(anterior.inicio) === Date.parse(inicio)) return anterior;
  const nova = await reservarAgenda(db, owner, conversaId, inicio, now, cliente, portas);
  const conclusao = await concluirCompromisso(db, owner, codigo, p.cliente);
  if (!conclusao.ok) {
    // Reversão: concluir a nova reserva e remover o Meet novo; a original permanece como estava.
    const novoCodigo = codigoDoRecibo(nova.id);
    if (novoCodigo !== undefined) await concluirCompromisso(db, owner, novoCodigo, p.cliente).catch(() => undefined);
    await p.apagarMeet(await idReservaCalendar(nova.inicio)).catch(() => undefined);
    throw new Error('Remarcação incompleta; equipe deve conferir ambos os compromissos.');
  }
  await p.apagarMeet(await idReservaCalendar(anterior.inicio)).catch(() => undefined);
  return nova;
}

/** Lança no ProJuris as consultas reservadas só no Google enquanto ele estava fora. Idempotente por codigoExterno. */
export async function sincronizarReservasPendentes(db: Db): Promise<number> {
  const rows = await db.from('casos').select('id,owner_id,dados').not('dados->agenteAna->reservaCalendar->pendenteProjuris', 'is', null);
  if (rows.error) throw new Error('Pendências da agenda indisponíveis.');
  const { atualizarConversa } = await import('./ana.server');
  let feitas = 0;
  for (const row of rows.data ?? []) {
    const reserva = (row.dados as { agenteAna?: { reservaCalendar?: ReservaCalendar } } | null)?.agenteAna?.reservaCalendar;
    const pend = reserva?.pendenteProjuris;
    if (!reserva || !pend) continue;
    try {
      const r = await reservarCompromisso(db, row.owner_id, { titulo: pend.titulo, inicioMs: Date.parse(reserva.inicio), fimMs: Date.parse(reserva.fim), codigoExterno: pend.codigoExterno, descricao: pend.descricao });
      if (!r.ok) { console.error('Pendência ProJuris não lançada', r.motivo); continue; }
      const nova: ReservaCalendar = { id: idReciboProjuris(r.codigo), inicio: reserva.inicio, fim: reserva.fim, ...(reserva.meetUrl ? { meetUrl: reserva.meetUrl } : {}) };
      await atualizarConversa(db, row.id, x => x.agenteAna?.reservaCalendar?.pendenteProjuris?.codigoExterno === pend.codigoExterno
        ? { ...x, agenteAna: { ...x.agenteAna, reservaCalendar: nova }, timeline: [...x.timeline, { data: new Date().toISOString(), evento: 'Consulta lançada no ProJuris após a volta do sistema.' }] }
        : x);
      feitas++;
    } catch (e) { console.error('ProJuris ainda indisponível para pendências', e); break; }
  }
  return feitas;
}
