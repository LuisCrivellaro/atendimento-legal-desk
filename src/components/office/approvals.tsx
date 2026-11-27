import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { RefreshCw, Search, Eye, Save, Loader2, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { readApprovalQueue, scheduleDraftReview } from '@/lib/approval-queue.functions';
import { draftStatus, reviewPriority, type ApprovalQueueRow } from '@/lib/approval-queue';
import { localDay, deadlineState } from '@/lib/dashboard';
import { Route as AuthRoute } from '@/routes/_authenticated/route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PageHeader, paginaClasse } from './shared';
import { ProcessReviews } from './process-reviews';
import { SkeletonTabela } from '@/components/skeletons';

export function ApprovalsPage() {
  const { user } = AuthRoute.useRouteContext();
  const read = useServerFn(readApprovalQueue); const schedule = useServerFn(scheduleDraftReview);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['approval-queue', user.id], queryFn: () => read(), refetchInterval: 15000, refetchOnWindowFocus: true });
  const [search, setSearch] = useState(''); const [lawyer, setLawyer] = useState('all');
  const [status, setStatus] = useState('pending'); const [deadline, setDeadline] = useState('all');
  const [selected, setSelected] = useState<ApprovalQueueRow | null>(null);
  const [assigned, setAssigned] = useState('none'); const [dueDate, setDueDate] = useState(''); const [busy, setBusy] = useState(false);
  const today = localDay(); const rows = query.data?.rows ?? []; const lawyers = query.data?.lawyers ?? [];
  const pending = rows.filter(r => !r.draftApproved);
  const visible = rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) &&
    (lawyer === 'all' || (r.lawyerId ?? 'none') === lawyer) &&
    (status === 'all' || (status === 'pending' ? !r.draftApproved : draftStatus(r) === status)) &&
    (deadline === 'all' || (deadline === 'none' ? !r.dueDate : !r.draftApproved && !!r.dueDate && r.dueDate <= today)))
    .sort((a, b) => reviewPriority(a, today) - reviewPriority(b, today) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.name.localeCompare(b.name));
  const open = (row: ApprovalQueueRow) => { setSelected(row); setAssigned(row.lawyerId ?? 'none'); setDueDate(row.dueDate ?? ''); };
  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await schedule({ data: { caseId: selected.id, lawyerId: assigned === 'none' ? null : assigned, dueDate: dueDate || null } });
      await qc.invalidateQueries({ queryKey: ['approval-queue', user.id] });
      toast.success('Responsável e prazo salvos.'); setSelected(null);
    } catch (error) { toast.error('Não foi possível salvar.', { description: (error as Error).message }); }
    finally { setBusy(false); }
  };
  return <div className={paginaClasse}>
    <PageHeader title="Aprovações">
      <span className="text-xs text-muted-foreground">{query.data?.entireOffice ? 'Escritório inteiro' : 'Meus casos'} · {query.data ? new Date(query.data.updatedAt).toLocaleTimeString('pt-BR') : '—'}</span>
      <Button variant="outline" size="icon" aria-label="Atualizar aprovações" title="Atualizar aprovações" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''} /></Button>
    </PageHeader>
    {/* Notícias processuais (componente próprio) numa superfície; a borda inferior dele some para não dobrar a da superfície. */}
    <div className="superficie mb-6 overflow-hidden [&>section]:border-b-0"><ProcessReviews /></div>
    {query.isPending ? <SkeletonTabela rotulo="Carregando aprovações…" /> : query.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">Não foi possível carregar as aprovações. Tente atualizar.<Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw />Tentar novamente</Button></div> : <>
      <h2 className="section-title mb-3">Minutas</h2>
      <div className="faixa-indicadores mb-3">
        {[{ label: 'Minutas pendentes', value: pending.length, risco: false }, { label: 'Vencidas / hoje', value: pending.filter(r => r.dueDate && r.dueDate <= today).length, risco: true }, { label: 'Sem advogado definido', value: pending.filter(r => !r.lawyerId).length, risco: false }].map(item => <div key={item.label} className="indicador"><span className={`indicador-valor ${item.risco && item.value > 0 ? 'text-destructive' : item.value === 0 ? 'text-muted-foreground' : ''}`}>{item.value}</span><span className="indicador-rotulo">{item.label}</span></div>)}
      </div>
      <section aria-labelledby="pendencias-advogado" className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm"><h3 id="pendencias-advogado" className="text-xs font-semibold text-foreground">Pendências por advogado</h3><dl className="contents">{[{ id: 'none', name: 'Sem advogado definido' }, ...lawyers].map(l => <div key={l.id} className="flex items-baseline gap-1.5"><dt className="text-xs text-muted-foreground">{l.name}</dt><dd className="font-semibold tabular-nums">{pending.filter(r => (r.lawyerId ?? 'none') === l.id).length}</dd></div>)}</dl></section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar minuta" placeholder="Buscar cliente" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Select value={lawyer} onValueChange={setLawyer}><SelectTrigger className="w-full sm:w-60" aria-label="Filtrar advogado"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os advogados</SelectItem><SelectItem value="none">Sem advogado definido</SelectItem>{lawyers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-60" aria-label="Filtrar aprovação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Todas as pendentes</SelectItem><SelectItem value="all">Todos os status</SelectItem>{['Aguardando aprovação', 'Checklist pendente', 'Nova aprovação necessária', 'Aprovada'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={deadline} onValueChange={setDeadline}><SelectTrigger className="w-full sm:w-48" aria-label="Filtrar prazo de aprovação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os prazos</SelectItem><SelectItem value="due">Vencidas / hoje</SelectItem><SelectItem value="none">Sem prazo</SelectItem></SelectContent></Select>
      </div>
      <div className="superficie overflow-x-auto"><table className="tabela-dados min-w-[850px]"><thead><tr>{['Cliente / origem', 'Advogado revisor', 'Status da minuta', 'Prazo de aprovação', ''].map((h, i) => <th key={i} className={i === 4 ? 'w-12' : undefined} scope="col">{h || <span className="sr-only">Ações</span>}</th>)}</tr></thead><tbody>{visible.map(r => <tr key={r.id}><td className="max-w-64"><p className="font-medium">{r.name}</p><p className="mt-0.5 text-2xs text-muted-foreground">{r.ownerName}</p></td><td className="max-w-52">{lawyers.find(l => l.id === r.lawyerId)?.name ?? <span className="text-muted-foreground">Sem advogado definido</span>}</td><td className="max-w-56"><Badge variant={r.draftApproved ? 'success' : 'warning'}>{draftStatus(r)}</Badge></td><td className={`tabular-nums ${!r.draftApproved && r.dueDate && r.dueDate <= today ? 'font-medium text-destructive' : 'text-foreground'}`}>{r.dueDate ? <>{r.dueDate.split('-').reverse().join('/')}<p className="mt-0.5 text-2xs font-normal">{r.draftApproved ? 'Concluída' : deadlineState(r.dueDate, today)}</p></> : <span className="text-muted-foreground">Sem prazo definido</span>}</td><td className="text-right"><Button variant="ghost" size="icon-sm" title="Examinar minuta" aria-label={`Examinar minuta de ${r.name}`} onClick={() => open(r)}><Eye /></Button></td></tr>)}</tbody></table>
      {!visible.length && <p className="border-t py-10 text-center text-sm text-muted-foreground">{rows.length ? 'Nenhuma minuta corresponde aos filtros.' : 'Nenhuma minuta salva para revisão.'}</p>}</div>
    </>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null); }}><DialogContent className="max-h-[90svh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected ? draftStatus(selected) : ''} · {selected?.ownerName}</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2"><label className="min-w-0 text-xs font-medium">Advogado revisor<Select value={assigned} onValueChange={setAssigned}><SelectTrigger className="mt-1.5" aria-label="Definir advogado revisor"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem advogado definido</SelectItem>{lawyers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></label><label className="text-xs font-medium">Prazo de aprovação<Input aria-label="Definir prazo de aprovação" className="mt-1.5" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label></div>
      <div className="max-h-[42svh] overflow-y-auto whitespace-pre-wrap break-words border-y py-3 font-serif text-sm leading-relaxed">{selected?.draft}</div>
      <div className="flex flex-wrap justify-end gap-2">{selected?.mine && <Button variant="outline" asChild><Link to="/producao" search={{ caseId: selected.id }}><ArrowUpRight />Revisão jurídica</Link></Button>}<Button onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Salvar responsável e prazo</Button></div>
    </DialogContent></Dialog>
  </div>;
}