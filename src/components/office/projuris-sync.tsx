import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, Loader2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { monitorarProjuris, sincronizarProjurisManual } from '@/lib/projuris-sync.functions';
import { dadosDesatualizados } from '@/lib/projuris/base';
import { dataHoraCurta } from '@/lib/atendimento';
import { toast } from 'sonner';

export function ProjurisSync() {
  const ler = useServerFn(monitorarProjuris); const sync = useServerFn(sincronizarProjurisManual);
  const qc = useQueryClient(); const [busy, setBusy] = useState(false); const [progresso, setProgresso] = useState('');
  const q = useQuery({ queryKey: ['projuris-monitor'], queryFn: () => ler(), retry: false });
  const atualizar = async (codigos?: number[]) => {
    if (busy) return; setBusy(true);
    try {
      if (!codigos) { setProgresso('Sincronizando cadastros…'); const r = await sync({ data: {} }); if (!r.ok) throw new Error(r.erro); toast.success(`${r.total} cadastros sincronizados.`); }
      else {
        let novas = 0, falhas = 0;
        for (const [i, codigo] of codigos.entries()) { setProgresso(`Processo ${i + 1} de ${codigos.length}`); try { const r = await sync({ data: { codigo } }); if (r.ok) novas += r.novas; else falhas++; } catch { falhas++; } }
        toast[falhas ? 'warning' : 'success'](`${novas} versões novas · ${falhas} processos com falha.`);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Sincronização não concluída.'); }
    finally { setBusy(false); setProgresso(''); await Promise.all([qc.invalidateQueries({ queryKey: ['projuris-monitor'] }), qc.invalidateQueries({ queryKey: ['projuris-clientes'] }), qc.invalidateQueries({ queryKey: ['projuris-nomes-conversas'] })]); }
  };
  const d = q.data;
  if (!d?.autorizado) return q.isError ? <p role="alert" className="mb-5 text-sm text-destructive">Monitoramento indisponível.</p> : null;
  const falhas = d.processos.filter(p => p.estado?.erro).length;
  return <section className="mb-6 space-y-4 border-y py-5" aria-label="Sincronização ProJuris">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl"><Database className="size-5 text-primary"/>Base própria CS.IA</h2><span className="text-xs text-muted-foreground">Automática: pendente de Inngest · próxima execução: não agendada</span></div>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Cadastros', d.clientes], ['Processos monitorados', d.processos.length], ['Versões de andamentos', d.versoes], ['Processos com falha', falhas]].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-xl font-semibold">{v}</dd></div>)}</dl>
    <p className="text-sm text-muted-foreground">{busy || d.sincronizando ? 'Sincronizando' : d.erro || falhas ? 'Falha na sincronização' : dadosDesatualizados(d.ultima) ? 'Dados desatualizados' : 'Dados sincronizados'} · Cadastro: {d.ultima ? dataHoraCurta(d.ultima) : 'ainda não sincronizado'}</p>
    {d.erro && <p role="alert" className="text-sm text-destructive">{d.erro}</p>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || d.sincronizando} onClick={() => void atualizar()}><RefreshCw/>Sincronizar cadastros</Button><Button disabled={busy || !d.processos.length} onClick={() => void atualizar(d.processos.map(p => p.codigo))}>{busy ? <Loader2 className="animate-spin"/> : <RefreshCw/>}Sincronizar andamentos</Button>{busy && <p role="status" className="self-center text-sm">{progresso}</p>}</div>
    {!!d.processos.length && <details><summary className="cursor-pointer text-sm font-medium">Processos e histórico de sincronização</summary><div className="mt-3 max-h-80 overflow-auto">{d.processos.map(p => <div key={p.codigo} className="flex items-center justify-between gap-3 border-b py-3"><div className="min-w-0 text-sm"><p className="break-words font-medium">{p.cliente}</p><p className="text-xs text-muted-foreground">{p.estado?.ultimo_sucesso ? `Andamentos: ${dataHoraCurta(p.estado.ultimo_sucesso)}` : 'Andamentos ainda não sincronizados'} · {p.estado?.atuais && Array.isArray(p.estado.atuais) ? p.estado.atuais.length : 0} registros</p>{p.estado?.erro && <p className="text-xs text-destructive">{p.estado.erro} · {p.estado.falhas} falha(s) · {p.estado.tentativa_em ? dataHoraCurta(p.estado.tentativa_em) : ''}</p>}</div><Button variant="ghost" size="icon" disabled={busy} aria-label={`Sincronizar processo ${p.numero}`} onClick={() => void atualizar([p.codigo])}><RefreshCw/></Button></div>)}</div></details>}
  </section>;
}