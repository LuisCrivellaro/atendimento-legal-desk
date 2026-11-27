import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { dataHoraCurta } from '@/lib/atendimento';
import { enviarRelatorioAdvogadoAgora, lerAuditoriaFilaAdvogado, verificarFilaAdvogado } from '@/lib/atendimento/fila-advogado.functions';

/**
 * Auditoria da fila do advogado (sênior/admin): resultado da verificação de todas as conversas, casos para conferir,
 * prévia do relatório corrigido e envio manual ao advogado depois da conferência. Verificar nunca envia nada.
 */
export function FilaAdvogadoAuditoria() {
  const ler = useServerFn(lerAuditoriaFilaAdvogado);
  const verificar = useServerFn(verificarFilaAdvogado);
  const enviar = useServerFn(enviarRelatorioAdvogadoAgora);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['fila-advogado-auditoria'], queryFn: () => ler(), staleTime: 30000, retry: false });
  const recarregar = () => qc.invalidateQueries({ queryKey: ['fila-advogado-auditoria'] });
  const rodar = async () => {
    setBusy(true);
    try {
      const r = await verificar();
      toast[r.completa ? 'success' : 'message'](r.completa ? `Verificação concluída: ${r.analisadas} conversa(s).` : `Verificação parcial: ${r.analisadas} conversa(s). Clique de novo para continuar.`);
      await recarregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível verificar a fila.'); } finally { setBusy(false); }
  };
  const mandar = async () => {
    if (!data || !window.confirm(`Enviar agora ao ${data.destinatario?.responsavel ?? 'advogado'} o relatório da prévia (${data.pendentes} pendente(s))?`)) return;
    setBusy(true);
    try { const r = await enviar(); toast.success(`Relatório enviado: ${r.pendentes} pendente(s).`); await recarregar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o relatório.'); } finally { setBusy(false); }
  };
  if (isLoading) return <p className="pt-3 text-xs text-muted-foreground">Carregando a auditoria da fila…</p>;
  if (error || !data) return <p className="pt-3 text-xs text-destructive">Auditoria da fila indisponível.</p>;
  const u = data.ultima;
  const lista = (titulo: string, itens: typeof data.ambiguas) => itens.length ? (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{titulo} ({itens.length})</p>
      <ul className="space-y-0.5 text-xs">{itens.map(i => <li key={`${titulo}-${i.conversaId}`}><Link to="/atendimento" search={{ conversa: i.conversaId }} className="underline">{i.nome}</Link> — {i.motivo}{i.desde ? ` · desde ${dataHoraCurta(i.desde)}` : ''}</li>)}</ul>
    </div>
  ) : null;
  return (
    <section aria-label="Auditoria da fila do advogado" className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Auditoria da fila do advogado</p>
      <p className="text-xs text-muted-foreground">{data.motivo}</p>
      {u ? (
        <p className="text-xs">
          Última verificação: {dataHoraCurta(u.concluidaEm)} · {u.analisadas} conversa(s) analisada(s) · {u.contagem.pendente} pendente(s) · {u.contagem.ambigua} para conferir · {u.contagem.resolvida} resolvida(s) · {u.contagem.antiga} antiga(s) para conferir · {u.naoVerificadas} não verificada(s) · {u.criadas} recuperada(s) nesta passagem · {u.foraDoWhatsApp} caso(s) sem WhatsApp ignorado(s){u.ok ? '' : ` · com falhas (${u.falha ?? 'ver auditoria'})`}
        </p>
      ) : <p className="text-xs font-medium text-destructive">Nenhuma verificação completa ainda.</p>}
      {data.emAndamento && <p className="text-xs text-muted-foreground">Verificação em andamento desde {dataHoraCurta(data.emAndamento.iniciadaEm)} ({data.emAndamento.analisadas} conversa(s) até agora).</p>}
      {lista('Para conferir', data.ambiguas)}
      {lista('Antigas (mais de 30 dias) para conferir', data.antigas)}
      {lista('Não verificadas', data.naoVerificadas)}
      {data.destinatarioDeCliente && <p className="text-xs font-medium text-destructive">O número do advogado pertence a um contato de cliente: o envio fica bloqueado.</p>}
      <div>
        <p className="text-xs font-medium text-muted-foreground">Prévia do relatório para {data.destinatario?.responsavel ?? 'o advogado'}</p>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted p-2 text-xs">{data.previa}</pre>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void rodar()}>Verificar todas as conversas (não envia nada)</Button>
        <Button size="sm" disabled={busy || !u || data.destinatarioDeCliente} onClick={() => void mandar()}>Enviar relatório corrigido</Button>
      </div>
      <p className="text-xs text-muted-foreground">O envio só acontece de segunda a sexta, das 09:00 às 17:30, fora de feriado nacional, e exige verificação com menos de 20 minutos.</p>
    </section>
  );
}
