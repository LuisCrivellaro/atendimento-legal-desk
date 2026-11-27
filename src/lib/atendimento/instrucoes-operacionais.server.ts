import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { aplicarInstrucoesAgenda, ERRO_HORARIO_BLOQUEADO, horarioBloqueado, lerInstrucoes, type InstrucaoOperacional } from './instrucoes-operacionais';
import type { TipoCliente } from './intake-rules';

type Db = SupabaseClient<Database>;

/**
 * Leitura das instruções operacionais para a Anne e as rotinas. Sempre do banco, no momento da ação (efeito imediato,
 * sem cache nem republicação); falha de leitura fecha — nenhum horário é oferecido ou reservado sem conferir.
 */
export async function instrucoesDoDono(db: Db, owner: string): Promise<InstrucaoOperacional[]> {
  const ws = await db.from('office_workspace').select('dados').eq('owner_id', owner).maybeSingle();
  if (ws.error) throw new Error('Instruções operacionais indisponíveis; nenhum horário oferecido.');
  return lerInstrucoes(ws.data?.dados);
}

/**
 * Ocupados da agenda oficial + bloqueios das instruções vigentes (suspensão = horizonte inteiro).
 * `seIndisponivel: []` repete a regra existente da Anne (ProJuris fora → regras locais; a reserva revalida depois),
 * mas os bloqueios das instruções continuam valendo.
 */
export async function ocupadosAgendaAnne(db: Db, owner: string, agora: Date, dias: number, tipo?: TipoCliente, seIndisponivel?: []): Promise<{ start: string; end: string }[] | null> {
  const { ocupadosAgenda } = await import('./projuris-agenda.server');
  const [busy, instrucoes] = await Promise.all([ocupadosAgenda(db, owner, agora, dias), instrucoesDoDono(db, owner)]);
  return aplicarInstrucoesAgenda(busy ?? seIndisponivel ?? null, instrucoes, agora, dias, tipo);
}

/** Revalidação imediatamente antes de reservar/remarcar (porta `revalidar` da agenda): relê as instruções. */
export function revalidarInstrucoes(db: Db, owner: string, tipo?: TipoCliente) {
  return async (inicio: string) => {
    if (horarioBloqueado(await instrucoesDoDono(db, owner), inicio, new Date(), tipo)) throw new Error(ERRO_HORARIO_BLOQUEADO);
  };
}
