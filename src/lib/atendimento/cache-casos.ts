// Cache das conversas no navegador: aplica ou relê uma conversa só, nunca a lista inteira.
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { carregarCaso } from '@/lib/casos';
import type { Conversa } from '@/lib/mock-data';
import { aplicarCaso, removerCaso } from './sincronizacao';

export function aplicarNoCache(qc: QueryClient, c: Conversa) {
  qc.setQueryData<Conversa[]>(['casos'], old => old ? aplicarCaso(old, c) : old);
}

export function alterarNoCache(qc: QueryClient, id: string, fn: (c: Conversa) => Conversa) {
  qc.setQueryData<Conversa[]>(['casos'], old => {
    const atual = old?.find(c => c.id === id);
    return old && atual ? aplicarCaso(old, fn(atual)) : old;
  });
}

/** Relê uma conversa do banco (ex.: depois de uma ação no servidor) e aplica no cache. */
export async function recarregarConversa(qc: QueryClient, id: string) {
  const c = await carregarCaso(id);
  qc.setQueryData<Conversa[]>(['casos'], old => old ? (c ? aplicarCaso(old, c) : removerCaso(old, id)) : old);
  return c;
}

/**
 * Campos que entram na revisão material do banco (material_revision exclui mensagens, timeline, syncs e
 * etapaPipeline): só quando eles mudam a aprovação precisa ser relida, e só deste caso.
 */
export function mudouMaterial(a: Conversa, b: Conversa) {
  const limpar = ({ mensagens: _m, timeline: _t, syncs: _s, etapaPipeline: _e, naoLidas: _n, lastMessageAt: _l, ...resto }: Conversa) => resto;
  return JSON.stringify(limpar(a)) !== JSON.stringify(limpar(b));
}

export async function relerAprovacao(qc: QueryClient, id: string) {
  const r = await supabase.rpc('material_status', { p_case: id });
  if (r.error) { await qc.invalidateQueries({ queryKey: ['material-approvals'] }); return; }
  qc.setQueriesData<Record<string, unknown>>({ queryKey: ['material-approvals'] }, old => old ? { ...old, [id]: r.data } : old);
}
