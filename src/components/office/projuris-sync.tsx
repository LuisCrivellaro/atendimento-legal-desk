import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, Loader2, Database, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { monitorarProjuris, sincronizarProjurisManual, historicoAndamentosProjuris } from '@/lib/projuris-sync.functions';
import { dataLegivel, type AndamentoPJ } from '@/lib/projuris/processos';
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
        const lote=codigos.slice(0,20);
        for (const [i, codigo] of lote.entries()) { setProgresso(`Processo ${i + 1} de ${lote.length}`); try { const r = await sync({ data: { codigo } }); if (r.ok) novas += r.novas; else falhas++; } catch { falhas++; } }
        toast[falhas ? 'warning' : 'success'](`${novas} versões novas · ${falhas} processos com falha.`);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Sincronização não concluída.'); }
    finally { setBusy(false); setProgresso(''); await Promise.all([qc.invalidateQueries({ queryKey: ['projuris-monitor'] }), qc.invalidateQueries({ queryKey: ['projuris-clientes'] }), qc.invalidateQueries({ queryKey: ['projuris-nomes-conversas'] })]); }
  };
  const d = q.data;
  if (!d?.autorizado) return q.isError ? <p role="alert" className="mb-5 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">Monitoramento indisponível.</p> : null;
  const falhas = d.processos.filter(p => p.estado?.erro).length;
  const pendentes = d.processos.filter(p => !p.estado?.ultimo_sucesso).length;
  const desatualizados = d.processos.filter(p => dadosDesatualizados(p.estado?.ultimo_sucesso)).length;
  // Situação geral em etiqueta suave; os números em faixa de indicadores; ações à direita na mesma linha do estado.
  const situacao = busy || d.sincronizando ? 'Sincronizando' : d.erro || falhas ? 'Falha na sincronização' : dadosDesatualizados(d.ultima) || desatualizados ? 'Dados desatualizados ou incompletos' : 'Dados sincronizados';
  const corSituacao = busy || d.sincronizando ? 'default' : d.erro || falhas ? 'destructive' : situacao === 'Dados sincronizados' ? 'success' : 'warning';
  return <section className="mb-6" aria-label="Sincronização ProJuris">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><h2 className="section-title flex items-center gap-2"><Database aria-hidden="true" className="size-4 text-primary"/>Base própria CS.IA</h2><span className="text-2xs text-muted-foreground">Automática: pendente de Inngest · próxima execução: não agendada</span></div>
    <dl className="faixa-indicadores mb-3">{[['Cadastros', d.clientes], ['Processos monitorados', d.processos.length], ['Versões de andamentos', d.versoes], ['Processos com falha', falhas]].map(([k, v]) => <div key={k} className="indicador"><dt className="indicador-rotulo order-2">{k}</dt><dd className={`indicador-valor ${k === 'Processos com falha' && Number(v) > 0 ? 'text-destructive' : ''}`}>{v}</dd></div>)}</dl>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><Badge variant={corSituacao}>{situacao}</Badge><span>Cadastro: {d.ultima ? dataHoraCurta(d.ultima) : 'ainda não sincronizado'} · {pendentes} processos aguardam primeira sincronização</span></p>
    <div className="flex flex-wrap items-center gap-2">{busy && <p role="status" className="text-xs text-muted-foreground">{progresso}</p>}<Button variant="outline" size="sm" disabled={busy || d.sincronizando} onClick={() => void atualizar()}><RefreshCw/>Sincronizar cadastros</Button><Button size="sm" disabled={busy || !d.processos.length} onClick={() => void atualizar([...d.processos].sort((a,b)=>Date.parse(a.estado?.ultimo_sucesso??'1970-01-01')-Date.parse(b.estado?.ultimo_sucesso??'1970-01-01')).map(p => p.codigo))}>{busy ? <Loader2 className="animate-spin"/> : <RefreshCw/>}Sincronizar andamentos (até 20)</Button></div></div>
    {d.erro && <p role="alert" className="mt-3 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">{d.erro}</p>}
    {!!d.processos.length && <details className="group mt-3"><summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-90"/>Processos e histórico de sincronização</summary><ul className="superficie mt-2 max-h-80 divide-y overflow-auto">{d.processos.map(p => <li key={p.codigo} className="px-4 py-2.5"><div className="flex items-center justify-between gap-3"><div className="min-w-0 text-sm"><p className="break-words font-medium">{p.cliente} · Processo {p.numero}</p><p className="text-2xs text-muted-foreground">{p.estado?.ultimo_sucesso ? `Andamentos: ${dataHoraCurta(p.estado.ultimo_sucesso)}` : 'Andamentos ainda não sincronizados'} · {p.estado?.atuais && Array.isArray(p.estado.atuais) ? p.estado.atuais.length : 0} registros</p>{p.estado?.erro && <p className="text-2xs text-destructive">{p.estado.erro} · {p.estado.falhas} falha(s) · {p.estado.tentativa_em ? dataHoraCurta(p.estado.tentativa_em) : ''}</p>}</div><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Sincronizar processo ${p.numero}`} onClick={() => void atualizar([p.codigo])}><RefreshCw/></Button></div>{p.estado?.ultimo_sucesso && <Historico codigo={p.codigo}/>}</li>)}</ul></details>}
  </section>;
}

function Historico({ codigo }: { codigo: number }) {
  const [aberto, setAberto] = useState(false); const ler = useServerFn(historicoAndamentosProjuris);
  const q = useQuery({ queryKey: ['projuris-historico', codigo], queryFn: () => ler({ data: { codigo } }), enabled: aberto, retry: false });
  return <details onToggle={e => setAberto(e.currentTarget.open)} className="group/hist mt-1.5 text-sm"><summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-150 group-open/hist:rotate-90"/>Ver movimentos e versões anteriores</summary>{q.isFetching ? <Loader2 className="mt-3 size-4 animate-spin text-muted-foreground"/> : q.error ? <p role="alert" className="mt-2 text-xs text-destructive">Histórico indisponível.</p> : q.data?.map(r => { const a = r.dados as unknown as AndamentoPJ; return <article key={r.id} className="mt-2.5 space-y-1 border-l pl-3"><p className="font-medium">{dataLegivel(a.data) ?? 'Data do andamento não informada'}{a.privado ? ' · Privado, não enviado ao cliente' : ''}</p><p className="whitespace-pre-wrap break-words">{a.descricao}</p><p className="text-2xs text-muted-foreground">Identificado: {dataHoraCurta(r.identificado_em)} · {r.origem}</p></article>; })}</details>;
}