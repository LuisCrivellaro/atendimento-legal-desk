import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { mensagemParaRetomar, reenfileirar, type PausaIA } from './pausa-ia';

type Db = SupabaseClient<Database>;
export type TesteChave = { ok: true } | { ok: false; motivo: string };

/**
 * Testa o mesmo caminho que falhou: uma chamada de 1 token com a chave e o modelo da Anne. Não leva dado de cliente
 * e não ativa nada. Só roda enquanto a IA estiver pausada.
 */
export async function testarChaveClaude(f: typeof fetch = fetch): Promise<TesteChave> {
  const key = process.env['ANTHROPIC_API_KEY']?.trim();
  if (!key) return { ok: false, motivo: 'A chave do Claude (ANTHROPIC_API_KEY) não está configurada no servidor.' };
  const { MODELO_PADRAO_ANA } = await import('@/lib/ana-claude/claude.server');
  try {
    const r = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env['ANA_MODELO'] || MODELO_PADRAO_ANA, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) return { ok: true };
    return { ok: false, motivo: r.status === 401 || r.status === 403 ? 'O Claude ainda recusa a chave de acesso.' : `O Claude respondeu ${r.status}; novo teste no próximo ciclo.` };
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Claude; novo teste no próximo ciclo.' };
  }
}

/** Áreas de trabalho com a IA pausada (só o campo da pausa; nunca o restante da área de trabalho). */
export async function pausasIA(db: Db): Promise<{ ownerId: string; pausa: PausaIA }[]> {
  const r = await db.from('office_workspace').select('owner_id,pausa:dados->anaPausa').eq('dados->anaPausa->>ativa', 'true');
  if (r.error) throw new Error('Área de trabalho indisponível.');
  return ((r.data ?? []) as unknown as { owner_id: string; pausa: PausaIA }[]).map(x => ({ ownerId: x.owner_id, pausa: x.pausa }));
}

async function reenfileirarPendentes(db: Db, ownerId: string, pausa: PausaIA | undefined, agora: Date) {
  const contatos = await db.from('atendimento_contatos_teste').select('conversa_id').eq('canal', 'ultramsg').eq('status', 'liberado');
  if (contatos.error) return { reenfileiradas: 0, falhas: 1 };
  const ids = [...new Set((contatos.data ?? []).map(c => c.conversa_id).filter((id): id is string => !!id))];
  if (!ids.length) return { reenfileiradas: 0, falhas: 0 };
  const rows = await db.from('casos').select('id,dados').eq('owner_id', ownerId).in('id', ids);
  if (rows.error) return { reenfileiradas: 0, falhas: 1 };
  const { atualizarConversa } = await import('./ana.server');
  let reenfileiradas = 0, falhas = 0;
  for (const row of rows.data ?? []) {
    const alvo = mensagemParaRetomar(row.dados as unknown as Conversa, pausa, agora.getTime());
    if (!alvo) continue;
    let feito = false;
    try {
      await atualizarConversa(db, row.id, x => {
        feito = mensagemParaRetomar(x, pausa, agora.getTime()) === alvo;
        return feito ? reenfileirar(x, alvo, agora) : x;
      });
      if (feito) reenfileiradas++;
    } catch { falhas++; }
  }
  return { reenfileiradas, falhas };
}

/**
 * Desliga a pausa da IA de uma área de trabalho (CAS, preservando o restante) e devolve à fila as mensagens recebidas
 * durante ela. Quem chama já testou a chave.
 */
export async function retomarIA(db: Db, ownerId: string, autor: { nome: string; sistema: boolean }, agora = new Date()) {
  let pausa: PausaIA | undefined;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const row = await db.from('office_workspace').select('dados,updated_at').eq('owner_id', ownerId).maybeSingle();
    if (row.error) throw new Error('Área de trabalho indisponível.');
    const dados = (row.data?.dados ?? {}) as Record<string, unknown> & { anaPausa?: PausaIA };
    if (!row.data || !dados.anaPausa?.ativa) return { retomada: false, reenfileiradas: 0, falhas: 0 };
    pausa = dados.anaPausa;
    const { anaPausa: _pausa, ...resto } = dados;
    const r = await db.from('office_workspace').update({ dados: resto as unknown as Json, updated_at: new Date().toISOString() }).eq('owner_id', ownerId).eq('updated_at', row.data.updated_at).select('owner_id');
    if (r.error) throw new Error('Não foi possível retomar a IA da Anne.');
    if (r.data?.length) break;
    if (tentativa === 4) throw new Error('Área de trabalho alterada ao mesmo tempo; tente de novo.');
  }
  const fila = await reenfileirarPendentes(db, ownerId, pausa, agora);
  await db.rpc('registrar_audit_log', {
    p_ator: autor.nome, p_perfil: autor.sistema ? 'sistema' : 'equipe', p_acao: 'pausaIA',
    p_resumo: `IA da Anne retomada: o Claude aceitou a chave. ${fila.reenfileiradas} mensagem(ns) recebida(s) na pausa voltaram para a fila${fila.falhas ? `; ${fila.falhas} não puderam ser conferidas` : ''}.`,
    p_status: 'sucesso',
  });
  return { retomada: true, ...fila };
}

/**
 * Etapa do monitor de 5 minutos: sem pausa, não faz nada (nem testa a chave). Com pausa, testa a chave e, se o Claude
 * aceitar, retoma. Chave ainda recusada vira falha da etapa, visível no painel de Automações.
 */
export async function verificarPausaIA(db: Db, agora = new Date(), testar: () => Promise<TesteChave> = testarChaveClaude) {
  const pausas = await pausasIA(db);
  if (!pausas.length) return { pausadas: 0 };
  const teste = await testar();
  if (!teste.ok) throw new Error(`IA pausada: ${teste.motivo}`);
  let retomadas = 0, reenfileiradas = 0;
  for (const p of pausas) {
    const r = await retomarIA(db, p.ownerId, { nome: 'Monitor', sistema: true }, agora);
    if (r.retomada) { retomadas++; reenfileiradas += r.reenfileiradas; }
  }
  return { pausadas: pausas.length, retomadas, reenfileiradas };
}
