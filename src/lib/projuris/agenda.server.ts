// Agenda do ProJuris — parte de servidor: leitura de compromissos e criação com proteção de overbooking.
// Regras: bloqueio serializado no banco (projuris_claim, código 0), releitura da agenda antes de gravar,
// idempotência por codigoExterno, verificação por leitura após a criação e NENHUM retry automático de escrita
// (em timeout/resposta inconclusiva, consulta-se pelo codigoExterno antes de qualquer nova tentativa).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { projuris, ErroProjuris } from './cliente.server';
import type { ChamadaProjuris } from './cliente.server';
import type { IdOperacaoProjuris } from './operacoes';

/** Assinatura mínima do cliente: aceita a instância real e dublês simples nos testes. */
export type ClienteAgenda = { chamar: (op: IdOperacaoProjuris, c?: ChamadaProjuris) => Promise<unknown> };
import {
  compromissosDaResposta,
  corpoConsultaCompromissos,
  corpoCriacaoCompromisso,
  corpoAlteracaoCompromisso,
  eventoDeDto,
  sobrepoe,
  PREFIXO_EXTERNO_MANAGER,
  type CompromissoPJ,
} from './agenda';
import { reciboCompromisso } from './migracao';
import { RESPONSAVEL_PADRAO } from './agenda';

type Db = SupabaseClient<Database>;

/** Compromissos (não concluídos) que cruzam o intervalo, já normalizados.
 *  A API ignora o filtro de período (confirmado em 04/11/2026: mesma resposta com e sem datas),
 *  então a filtragem por intervalo é feita aqui, depois da leitura completa. */
export async function listarCompromissos(
  inicioMs: number,
  fimMs: number,
  cliente: ClienteAgenda = projuris,
): Promise<CompromissoPJ[]> {
  const raw = await cliente.chamar('tarefa.compromissoConsulta', { corpo: corpoConsultaCompromissos(inicioMs, fimMs) });
  return compromissosDaResposta(raw).filter(c => !c.concluido && sobrepoe(inicioMs, fimMs, c.inicioMs, c.fimMs));
}

/** Busca por codigoExterno (idempotência): devolve o compromisso já criado, se existir. */
export async function buscarPorCodigoExterno(
  codigoExterno: string,
  cliente: ClienteAgenda = projuris,
): Promise<CompromissoPJ | undefined> {
  const raw = await cliente.chamar('tarefa.compromissoConsulta', { corpo: { codigoExterno, flagCompromisso: true } });
  return compromissosDaResposta(raw).find(c => c.codigoExterno === codigoExterno);
}

export interface PedidoReserva {
  titulo: string;
  inicioMs: number;
  fimMs: number;
  codigoExterno: string;
  descricao?: string;
  codigoUsuarioResponsavel?: number;
}

export type ResultadoReserva =
  | { ok: true; codigo: number; jaExistia: boolean }
  | { ok: false; motivo: 'conflito' | 'ocupado' | 'indisponivel' | 'inconclusivo'; detalhe?: string };

/**
 * Cria um compromisso com proteção de overbooking:
 * 1. Bloqueio exclusivo no banco (serializa reservas simultâneas e a sincronização cadastral).
 * 2. Releitura da agenda no período e verificação de sobreposição.
 * 3. Verificação de idempotência pelo codigoExterno (repetição segura após timeout).
 * 4. Criação e confirmação por leitura (GET) antes de declarar sucesso.
 * Nunca confirma sem evidência de registro; nunca tenta gravar duas vezes sem consultar antes.
 */
export async function reservarCompromisso(
  db: Db,
  owner: string,
  pedido: PedidoReserva,
  cliente: ClienteAgenda = projuris,
): Promise<ResultadoReserva> {
  if (!pedido.codigoExterno.startsWith(PREFIXO_EXTERNO_MANAGER)) {
    throw new Error('codigoExterno fora do padrão do Manager ADV.');
  }
  if (!(pedido.fimMs > pedido.inicioMs)) throw new Error('Horário de término inválido.');
  const token = crypto.randomUUID();
  const claim = await db.rpc('projuris_claim', { p_owner: owner, p_codigo: 0, p_token: token });
  if (claim.error || !claim.data) return { ok: false, motivo: 'ocupado', detalhe: 'Outra operação de agenda em andamento.' };
  const liberar = () =>
    db.from('projuris_base').update({ lease_token: null, lease_ate: null }).eq('owner_id', owner).eq('lease_token', token)
      .then(() => undefined);
  try {
    // Idempotência: se uma tentativa anterior gravou sem resposta, reutiliza o registro existente.
    const existente = await buscarPorCodigoExterno(pedido.codigoExterno, cliente);
    if (existente) {
      const raw = await cliente.chamar('tarefa.compromissoObter', { parametros: { codigo: existente.codigo } });
      if (!reciboCompromisso(raw, pedido, RESPONSAVEL_PADRAO.chave)) return { ok: false, motivo: 'inconclusivo', detalhe: 'Registro de origem existente diverge; conferir na equipe.' };
      return { ok: true, codigo: existente.codigo, jaExistia: true };
    }

    // Releitura da agenda já com o bloqueio: ninguém grava entre a verificação e a criação.
    const agenda = await listarCompromissos(pedido.inicioMs, pedido.fimMs, cliente);
    const conflito = agenda.find(c => sobrepoe(pedido.inicioMs, pedido.fimMs, c.inicioMs, c.fimMs));
    if (conflito) return { ok: false, motivo: 'conflito', detalhe: `Horário ocupado por "${conflito.titulo || 'compromisso'}".` };

    let criado: unknown;
    try {
      criado = await cliente.chamar('tarefa.compromissoCriar', { corpo: corpoCriacaoCompromisso(pedido) });
    } catch (e) {
      // Timeout/5xx inconclusivo: a gravação pode ter ocorrido. Consulta antes de qualquer nova tentativa.
      if (e instanceof ErroProjuris && (e.tipo === 'tempo' || e.tipo === 'indisponivel' || e.tipo === 'limite')) {
        const gravado = await buscarPorCodigoExterno(pedido.codigoExterno, cliente).catch(() => undefined);
        if (gravado) {
          const raw = await cliente.chamar('tarefa.compromissoObter', { parametros: { codigo: gravado.codigo } }).catch(() => null);
          if (reciboCompromisso(raw, pedido, RESPONSAVEL_PADRAO.chave)) return { ok: true, codigo: gravado.codigo, jaExistia: true };
        }
        return { ok: false, motivo: 'inconclusivo', detalhe: 'Sem confirmação do ProJuris; conferir antes de qualquer nova tentativa.' };
      }
      throw e;
    }
    const chave = criado && typeof criado === 'object' ? (criado as Record<string, unknown>)['chave'] : undefined;
    const codigo = typeof chave === 'number' && Number.isSafeInteger(chave) && chave > 0 ? chave : undefined;
    if (codigo === undefined) return { ok: false, motivo: 'inconclusivo', detalhe: 'Criação sem código de retorno.' };

    // Confirmação real por leitura antes de declarar sucesso.
    const confirmacao = await cliente.chamar('tarefa.compromissoObter', { parametros: { codigo } }).catch(() => null);
    if (!reciboCompromisso(confirmacao, pedido, RESPONSAVEL_PADRAO.chave)) return { ok: false, motivo: 'inconclusivo', detalhe: 'Criado, mas horário, origem ou responsável não foram confirmados.' };
    return { ok: true, codigo, jaExistia: false };
  } finally {
    await liberar();
  }
}

/** Lê o DTO completo de um compromisso; devolve undefined quando inexistente ou incompleto. */
export async function obterCompromisso(
  codigo: number,
  cliente: ClienteAgenda = projuris,
): Promise<Record<string, unknown> | undefined> {
  const raw = await cliente.chamar('tarefa.compromissoObter', { parametros: { codigo } }).catch(() => undefined);
  return eventoDeDto(raw) ? (raw as Record<string, unknown>) : undefined;
}

export type ResultadoAlteracao =
  | { ok: true }
  | { ok: false; motivo: 'conflito' | 'ausente' | 'ocupado' | 'inconclusivo'; detalhe?: string };

/**
 * Altera o horário de um compromisso com o mesmo bloqueio serializado da reserva:
 * releitura do DTO sob o lease, verificação de conflito no novo intervalo (excluindo o próprio),
 * PUT do objeto do compromisso direto (formato confirmado na API real em 04/11/2026) e confirmação por leitura.
 * Nunca repete a escrita automaticamente: resposta inconclusiva fica para conferência humana.
 */
export async function alterarHorarioCompromisso(
  db: Db,
  owner: string,
  codigo: number,
  inicioMs: number,
  fimMs: number,
  cliente: ClienteAgenda = projuris,
): Promise<ResultadoAlteracao> {
  if (!(fimMs > inicioMs)) throw new Error('Horário de término inválido.');
  const token = crypto.randomUUID();
  const claim = await db.rpc('projuris_claim', { p_owner: owner, p_codigo: 0, p_token: token });
  if (claim.error || !claim.data) return { ok: false, motivo: 'ocupado', detalhe: 'Outra operação de agenda em andamento.' };
  const liberar = () =>
    db.from('projuris_base').update({ lease_token: null, lease_ate: null }).eq('owner_id', owner).eq('lease_token', token)
      .then(() => undefined);
  try {
    const dto = await obterCompromisso(codigo, cliente);
    if (!dto) return { ok: false, motivo: 'ausente', detalhe: 'Compromisso não encontrado no ProJuris.' };
    const evento = eventoDeDto(dto)!;
    if (evento['concluido'] === true) return { ok: false, motivo: 'ausente', detalhe: 'Compromisso já concluído.' };
    const agenda = await listarCompromissos(inicioMs, fimMs, cliente);
    const conflito = agenda.find(c => c.codigo !== codigo && sobrepoe(inicioMs, fimMs, c.inicioMs, c.fimMs));
    if (conflito) return { ok: false, motivo: 'conflito', detalhe: `Horário ocupado por "${conflito.titulo || 'compromisso'}".` };
    await cliente.chamar('tarefa.compromissoAlterar', { corpo: corpoAlteracaoCompromisso(dto, { inicioMs, fimMs }) });
    const confirmacao = await obterCompromisso(codigo, cliente);
    const ev = confirmacao ? eventoDeDto(confirmacao) : undefined;
    if (!ev || ev['dataHoraInicio'] !== inicioMs || ev['dataHoraFim'] !== fimMs)
      return { ok: false, motivo: 'inconclusivo', detalhe: 'Alteração não confirmada na leitura; conferir no ProJuris antes de repetir.' };
    return { ok: true };
  } finally {
    await liberar();
  }
}

/**
 * Conclui um compromisso (cancelamento autorizado; exclusão é proibida e desligada no ProJuris).
 * Endpoint dedicado sem corpo (swagger.json oficial), sob o mesmo lease, com confirmação por leitura.
 */
export async function concluirCompromisso(
  db: Db,
  owner: string,
  codigo: number,
  cliente: ClienteAgenda = projuris,
): Promise<ResultadoAlteracao> {
  const token = crypto.randomUUID();
  const claim = await db.rpc('projuris_claim', { p_owner: owner, p_codigo: 0, p_token: token });
  if (claim.error || !claim.data) return { ok: false, motivo: 'ocupado', detalhe: 'Outra operação de agenda em andamento.' };
  const liberar = () =>
    db.from('projuris_base').update({ lease_token: null, lease_ate: null }).eq('owner_id', owner).eq('lease_token', token)
      .then(() => undefined);
  try {
    const dto = await obterCompromisso(codigo, cliente);
    if (!dto) return { ok: false, motivo: 'ausente', detalhe: 'Compromisso não encontrado no ProJuris.' };
    if (eventoDeDto(dto)!['concluido'] === true) return { ok: true }; // já concluído: estado desejado
    await cliente.chamar('tarefa.compromissoConcluir', { parametros: { codigo } });
    const confirmacao = await obterCompromisso(codigo, cliente);
    if (!confirmacao || eventoDeDto(confirmacao)!['concluido'] !== true)
      return { ok: false, motivo: 'inconclusivo', detalhe: 'Conclusão não confirmada na leitura; conferir no ProJuris antes de repetir.' };
    return { ok: true };
  } finally {
    await liberar();
  }
}
