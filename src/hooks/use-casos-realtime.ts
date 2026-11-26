import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { carregarCaso, casosAlteradosDesde } from '@/lib/casos';
import { aplicarCasos, removerCaso } from '@/lib/atendimento/sincronizacao';
import { registrarMedida } from '@/lib/atendimento/medicoes';
import type { Conversa } from '@/lib/mock-data';

const CHAVE = ['casos'] as const;
/** `updated_at` pode vir do relógio do navegador (salvarCaso): a varredura relê uma janela larga. */
const FOLGA_MS = 15 * 60000;
/** Com o tempo real ativo, só uma varredura leve (linhas alteradas) por minuto como rede de segurança. */
const SEGURANCA_MS = 60000;
/** Sem o canal (queda, rede instável), a varredura do que mudou passa a cada 20 s até reconectar. */
const SEM_TEMPO_REAL_MS = 20000;

/**
 * Sincronização incremental da lista de conversas (cache ['casos']): cada evento do Supabase Realtime busca só a
 * conversa que mudou e a aplica no cache; nada é baixado se a lista ainda não foi carregada. Ao reconectar
 * (queda do canal ou volta da rede) faz uma recarga completa para recuperar o que chegou durante a interrupção.
 */
export function useCasosRealtime(owner: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!owner) return;
    let vivo = true, ativo = false, caiu = false, ultimaVarredura = Date.now(), ocultoDesde = 0;
    const pendentes = new Set<string>();
    const versao = new Map<string, number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const temLista = () => !!qc.getQueryData<Conversa[]>(CHAVE);
    const aplicar = (casos: Conversa[], removidos: string[] = []) => qc.setQueryData<Conversa[]>(CHAVE, old => {
      if (!old) return old;
      let l = aplicarCasos(old, casos);
      for (const id of removidos) l = removerCaso(l, id);
      return l;
    });
    const buscar = async () => {
      timer = undefined;
      const ids = [...pendentes]; pendentes.clear();
      if (!ids.length || !temLista()) return;
      const t0 = performance.now();
      // Só a resposta mais nova de cada conversa vale (duas buscas da mesma conversa podem se cruzar).
      const seq = ids.map(id => { const v = (versao.get(id) ?? 0) + 1; versao.set(id, v); return v; });
      const res = await Promise.allSettled(ids.map(id => carregarCaso(id)));
      if (!vivo) return;
      const casos: Conversa[] = [], removidos: string[] = [];
      res.forEach((r, i) => {
        const id = ids[i]!;
        if (versao.get(id) !== seq[i]) return;
        if (r.status === 'rejected') { pendentes.add(id); return; }
        if (r.value) casos.push(r.value); else removidos.push(id);
      });
      aplicar(casos, removidos);
      registrarMedida('tempoReal.buscarEAplicar', performance.now() - t0, { conversas: casos.length });
      if (pendentes.size) agendar(3000);
    };
    // Agrupa rajadas (a mesma mensagem gera várias gravações: mensagem, anexo, Anne) em uma busca por conversa.
    const agendar = (ms = 120) => { if (!timer) timer = setTimeout(() => void buscar(), ms); };
    const varrer = async () => {
      if (!temLista()) return;
      const inicio = Date.now(), t0 = performance.now();
      try {
        const casos = await casosAlteradosDesde(new Date(ultimaVarredura - FOLGA_MS).toISOString());
        if (!vivo) return;
        aplicar(casos);
        ultimaVarredura = inicio;
        registrarMedida('tempoReal.varredura', performance.now() - t0, { conversas: casos.length });
      } catch { /* próxima volta tenta de novo */ }
    };
    const recarregar = () => { ultimaVarredura = Date.now(); void qc.invalidateQueries({ queryKey: CHAVE }); };
    const channel = supabase.channel(`casos-${owner}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos', filter: `owner_id=eq.${owner}` }, p => {
        const id = (p.new as { id?: string } | null)?.id ?? (p.old as { id?: string } | null)?.id;
        if (!id) return;
        if (p.eventType === 'DELETE') { aplicar([], [id]); return; }
        pendentes.add(id); agendar();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { if (caiu) { caiu = false; recarregar(); } ativo = true; }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { if (ativo) caiu = true; ativo = false; }
      });
    const intervalo = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaVarredura >= (ativo ? SEGURANCA_MS : SEM_TEMPO_REAL_MS)) void varrer();
    }, 5000);
    const visibilidade = () => {
      if (document.visibilityState === 'hidden') { ocultoDesde = Date.now(); return; }
      if (ocultoDesde && Date.now() - ocultoDesde > 30000) void varrer();
      ocultoDesde = 0;
    };
    const online = () => recarregar();
    document.addEventListener('visibilitychange', visibilidade);
    window.addEventListener('online', online);
    return () => {
      vivo = false; clearInterval(intervalo); if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibilidade);
      window.removeEventListener('online', online);
      void supabase.removeChannel(channel);
    };
  }, [owner, qc]);
}
