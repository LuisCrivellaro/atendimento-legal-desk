import { useState } from 'react';
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Search, Loader2, Scale, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Empty } from './shared';
import { contenciosoQuery } from '@/lib/contencioso-query';
import { sincronizarProjurisManual } from '@/lib/projuris-sync.functions';
import { dataLegivel } from '@/lib/projuris/processos';
import { dataHoraCurta } from '@/lib/atendimento';
import type { FiltrosContencioso } from '@/lib/contencioso';
import { filtrosContencioso } from '@/lib/contencioso';
import { toast } from 'sonner';

export function ContenciosoPage({ filtros: filtrosIniciais, modo, codigo }: { filtros: FiltrosContencioso; modo: 'processos' | 'andamentos' | 'ficha'; codigo?: number }) {
  const searchStr = useRouterState({ select: s => s.location.searchStr });
  const filtros = filtrosContencioso.parse({ ...filtrosIniciais, ...Object.fromEntries(new URLSearchParams(searchStr)) });
  const { data: d } = useSuspenseQuery(contenciosoQuery(filtros, modo, codigo));
  const navigate = useNavigate(); const qc = useQueryClient(); const sincronizar = useServerFn(sincronizarProjurisManual);
  const [busy, setBusy] = useState(false); const [progresso, setProgresso] = useState('');
  const alterar = (mudanca: Partial<FiltrosContencioso>) => {
    const search = { ...filtros, pagina: 0, ...mudanca };
    if (modo === 'ficha' && codigo) void navigate({ to: '/contencioso/processos/$codigo', params: { codigo: String(codigo) }, search });
    else if (modo === 'andamentos') void navigate({ to: '/contencioso/andamentos', search });
    else void navigate({ to: '/contencioso/processos', search });
  };
  const atualizar = async (escopo: 'cadastros' | 'geral' | 'individual') => {
    if (busy) return; setBusy(true);
    let novas = 0, falhas = 0, completos = 0;
    try {
      if (escopo === 'cadastros') {
        setProgresso('Importando processos e cadastros…'); const r = await sincronizar({ data: {} }); if (!r.ok) throw new Error(r.erro);
        toast.success(`${r.total} clientes atualizados; processos vinculados preservados.`);
      } else {
        const fila = escopo === 'individual' && codigo ? [codigo] : d.fila;
        for (const [i, id] of fila.entries()) {
          setProgresso(`Sincronizando processo ${i + 1} de ${fila.length}`);
          try { const r = await sincronizar({ data: { codigo: id } }); if (r.ok) { novas += r.novas; completos++; } else falhas++; }
          catch { falhas++; }
          // Every process has its own durable commit. A closed tab never undoes completed snapshots.
        }
        toast[falhas ? 'warning' : 'success'](`${completos} processos sincronizados · ${novas} versões novas · ${falhas} falhas.`);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Sincronização não concluída.'); }
    finally {
      setBusy(false); setProgresso('');
      await Promise.all(['contencioso', 'projuris-monitor', 'projuris-clientes', 'projuris-nomes-conversas'].map(k => qc.invalidateQueries({ queryKey: [k] })));
    }
  };
  const pagina = modo === 'processos' ? d.processos : d.movimentos;
  return <div className="mx-auto max-w-[1500px] p-4 md:p-8">
    {modo === 'ficha' && <Button asChild variant="ghost" className="mb-4"><Link to="/contencioso/processos"><ArrowLeft/>Processos</Link></Button>}
    <PageHeader title={modo === 'processos' ? 'Processos' : modo === 'andamentos' ? 'Andamentos processuais' : d.ficha?.numero ?? 'Processo — número não informado'}>
      {modo === 'ficha' ? <Button disabled={busy} onClick={() => void atualizar('individual')}><RefreshCw className={busy ? 'animate-spin' : ''}/>Sincronizar processo</Button> : <>
        <Button variant="outline" disabled={busy} onClick={() => void atualizar('cadastros')}><RefreshCw/>Importar / atualizar processos</Button>
        <Button disabled={busy || !d.fila.length} onClick={() => void atualizar('geral')}>{busy ? <Loader2 className="animate-spin"/> : <RefreshCw/>}Sincronizar históricos</Button>
      </>}
    </PageHeader>
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Contencioso">
      <Button asChild size="sm" variant={modo !== 'andamentos' ? 'default' : 'outline'}><Link to="/contencioso/processos"><Scale/>Processos</Link></Button>
      <Button asChild size="sm" variant={modo === 'andamentos' ? 'default' : 'outline'}><Link to="/contencioso/andamentos"><FileText/>Andamentos processuais</Link></Button>
    </nav>
    <section aria-label="Sincronização do Contencioso" className="mb-6 border-y py-5">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[['Processos importados', d.painel.processos], ['Andamentos sincronizados', d.painel.andamentos], ['Históricos pendentes', d.painel.pendentes], ['Falhas', d.painel.falhas]].map(([label, valor]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold">{valor}</dd></div>)}</dl>
      <p className="mt-4 text-xs text-muted-foreground">Cadastro: {d.painel.ultima ? dataHoraCurta(d.painel.ultima) : 'não sincronizado'} · Último histórico: {d.painel.historicoEm ? dataHoraCurta(d.painel.historicoEm) : 'não sincronizado'}</p>
      {busy && <p className="mt-3 flex items-center gap-2 text-sm" role="status"><Loader2 className="size-4 animate-spin"/>{progresso}</p>}
      {d.painel.erro && <p role="alert" className="mt-3 text-sm text-destructive">{d.painel.erro}</p>}
      {!!d.falhas.length && <details className="mt-3 text-sm"><summary className="cursor-pointer text-destructive">Falhas de sincronização ({d.falhas.length})</summary>{d.falhas.map(f => <div key={f.codigo} className="border-b py-3"><Link className="text-primary" to="/contencioso/processos/$codigo" params={{ codigo: String(f.codigo) }}>{f.numero ?? 'Número não informado'}</Link><p>{f.erro} · {f.falhas} tentativa(s)</p><p className="text-xs text-muted-foreground">{f.tentativaEm ? dataHoraCurta(f.tentativaEm) : 'Data não informada'}{f.retryEm ? ` · nova tentativa elegível a partir de ${dataHoraCurta(f.retryEm)}` : ''}</p></div>)}</details>}
    </section>
    {d.ficha && <>
      <h2 className="mb-3 text-xl">{d.ficha.clientes.map(c => c.nome).join(' / ')}</h2>
      <dl className="mb-6 grid gap-5 border-b pb-6 sm:grid-cols-2 lg:grid-cols-3">{[
        ['CPF/CNPJ', d.ficha.clientes.map(c => c.cpfCnpj ?? 'Não informado').join(' / ')], ['Tribunal', d.ficha.tribunal], ['Vara', d.ficha.vara], ['Classe', d.ficha.classe], ['Assunto', d.ficha.assunto], ['Polo do cliente', d.ficha.clientes.map(c => c.polo ?? 'Não informado').join(' / ')], ['Situação', d.ficha.situacao], ['Última movimentação', dataLegivel(d.ficha.ultimaMovimentacao ?? undefined)], ['Andamentos disponíveis', String(d.ficha.quantidade)],
      ].map(([label, valor]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{valor || 'Não informado pela API'}</dd></div>)}</dl>
      <h2 className="mb-4 text-xl">Linha do tempo</h2>
      {!d.ficha.sincronizadoEm && <p className="mb-4 text-sm text-muted-foreground">Histórico ainda não importado.</p>}
    </>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {modo !== 'ficha' && <><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><Input aria-label="Pesquisar Contencioso" placeholder={modo === 'andamentos' ? 'Cliente, processo ou descrição' : 'Cliente, CPF/CNPJ ou CNJ'} className="pl-9" value={filtros.busca} onChange={e => alterar({ busca: e.target.value })}/></div>
      <Filtro label="Cliente" valor={filtros.cliente} alterar={v => alterar({ cliente: v })} opcoes={d.opcoes.clientes.map(c => ({ valor: String(c.codigo), nome: c.nome }))}/>
      <Filtro label="Tribunal" valor={filtros.tribunal} alterar={v => alterar({ tribunal: v })} opcoes={d.opcoes.tribunais.map(t => ({ valor: t, nome: t }))}/>
      {modo === 'processos' ? <Filtro label="Situação" valor={filtros.situacao} alterar={v => alterar({ situacao: v })} opcoes={d.opcoes.situacoes.map(t => ({ valor: t, nome: t }))}/> : <Filtro label="Processo" valor={filtros.processo} alterar={v => alterar({ processo: v })} opcoes={d.referencias.map(p => ({ valor: String(p.codigo), nome: p.numero ?? 'Número não informado' }))}/>}</>}
      <div><Label htmlFor="contencioso-inicio" className="text-xs">{modo === 'processos' ? 'Última movimentação — de' : 'Movimentação — de'}</Label><Input id="contencioso-inicio" type="date" value={filtros.inicio} onChange={e => alterar({ inicio: e.target.value })}/></div>
      <div><Label htmlFor="contencioso-fim" className="text-xs">Até</Label><Input id="contencioso-fim" type="date" value={filtros.fim} onChange={e => alterar({ fim: e.target.value })}/></div>
      <div><Label className="text-xs">Ordenação</Label><Select value={filtros.ordem} onValueChange={v => alterar({ ordem: v as FiltrosContencioso['ordem'] })}><SelectTrigger aria-label="Ordenação"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="recente">Mais recentes</SelectItem><SelectItem value="antigo">Mais antigos</SelectItem>{modo === 'processos' && <><SelectItem value="cliente">Cliente A–Z</SelectItem><SelectItem value="numero">Número CNJ</SelectItem></>}</SelectContent></Select></div>
      <Button variant="ghost" className="self-end" onClick={() => alterar({ busca: '', cliente: '', tribunal: '', situacao: '', processo: '', inicio: '', fim: '' })}>Limpar filtros</Button>
    </div>
    {modo === 'processos' ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-muted text-xs text-muted-foreground"><tr>{['Cliente / CPF ou CNPJ', 'Processo / Tribunal e vara', 'Classe / Assunto / Polo', 'Situação', 'Última movimentação', 'Andamentos', ''].map((t, i) => <th key={i} className="p-3 font-medium">{t}</th>)}</tr></thead><tbody>{d.processos.itens.map(p => <tr key={p.codigo} className="border-b hover:bg-muted/50"><td className="max-w-64 p-3">{p.clientes.map(c => <div key={c.codigo} className="mb-2"><Link to="/clientes" search={{ clientId: String(c.codigo) }} className="font-medium text-primary">{c.nome}</Link><p className="text-xs text-muted-foreground">{c.cpfCnpj ?? 'CPF/CNPJ não informado'}</p></div>)}</td><td className="max-w-64 p-3"><Link to="/contencioso/processos/$codigo" params={{ codigo: String(p.codigo) }} className="font-medium text-primary">{p.numero ?? 'CNJ não informado'}</Link><p className="mt-1 text-xs text-muted-foreground">{[p.tribunal, p.vara].filter(Boolean).join(' · ') || 'Tribunal/vara não informados'}</p></td><td className="max-w-52 p-3"><p>{p.classe ?? 'Classe não informada'}</p><p className="mt-1 text-xs text-muted-foreground">{p.assunto ?? 'Assunto não informado'}</p><p className="mt-1 text-xs">{p.clientes.map(c => c.polo).filter(Boolean).join(' / ') || 'Polo não informado'}</p></td><td className="p-3"><Badge variant="outline">{p.situacao ?? 'Não informada'}</Badge>{p.erro && <p className="mt-2 text-xs text-destructive">Falha na sincronização</p>}</td><td className="whitespace-nowrap p-3">{dataLegivel(p.ultimaMovimentacao ?? undefined) ?? 'Não informada'}</td><td className="p-3">{p.sincronizadoEm ? p.quantidade : 'Pendente'}</td><td className="p-3"><Button asChild size="icon" variant="ghost"><Link aria-label={`Abrir processo ${p.numero ?? p.identificador ?? ''}`} to="/contencioso/processos/$codigo" params={{ codigo: String(p.codigo) }}><ArrowRight/></Link></Button></td></tr>)}</tbody></table>{!d.processos.itens.length && <Empty text="Nenhum processo encontrado."/>}</div> : <div>{d.movimentos.itens.map(a => <article key={`${a.codigoProcesso}:${a.codigo}`} className="mb-5 border-l-2 border-primary pl-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{dataLegivel(a.data) ?? 'Data não informada'}{a.hora ? ` · ${a.hora.slice(0, 5)}` : ''}</span><Badge variant="outline">{a.tipo ?? 'Tipo não informado'}</Badge>{a.privado && <span className="text-xs text-muted-foreground">Privado · uso interno</span>}</div>
      {modo === 'andamentos' && <Link to="/contencioso/processos/$codigo" params={{ codigo: String(a.codigoProcesso) }} className="mb-2 block text-sm text-primary">{d.referencias.find(p => p.codigo === a.codigoProcesso)?.clientes.map(c => c.nome).join(' / ')} · {d.referencias.find(p => p.codigo === a.codigoProcesso)?.numero ?? 'Número não informado'}</Link>}
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{a.descricao}</p>
      <p className="mt-2 text-xs text-muted-foreground">ProJuris API oficial</p>
    </article>)}{!d.movimentos.itens.length && <Empty text="Nenhum andamento disponível para estes filtros."/>}</div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-sm text-muted-foreground">{pagina.total} {modo === 'processos' ? 'processos' : 'andamentos'} · Página {pagina.pagina + 1} de {pagina.paginas}</p><div className="flex gap-2"><Button aria-label="Página anterior" variant="outline" size="icon" disabled={!pagina.pagina} onClick={() => alterar({ pagina: pagina.pagina - 1 })}><ChevronLeft/></Button><Button aria-label="Próxima página" variant="outline" size="icon" disabled={pagina.pagina + 1 >= pagina.paginas} onClick={() => alterar({ pagina: pagina.pagina + 1 })}><ChevronRight/></Button></div></div>
    <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">Histórico acessível pela API oficial de andamentos. A consulta classificada apresentou erro 500; equivalência com “Visualizar todos” não comprovada. Documentos vinculados não estão disponíveis nesta consulta; nenhum arquivo é baixado por este módulo.</p>
  </div>;
}
function Filtro({ label, valor, alterar, opcoes }: { label: string; valor: string; alterar: (v: string) => void; opcoes: { valor: string; nome: string }[] }) {
  return <Select value={valor || '__todos'} onValueChange={v => alterar(v === '__todos' ? '' : v)}><SelectTrigger aria-label={label} className="w-full"><SelectValue placeholder={label}/></SelectTrigger><SelectContent><SelectItem value="__todos">{label}: todos</SelectItem>{opcoes.map(o => <SelectItem key={o.valor} value={o.valor}>{o.nome}</SelectItem>)}</SelectContent></Select>;
}
export function ContenciosoError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return <div className="p-8"><h1 className="mb-4 text-2xl">Contencioso</h1><p role="alert" className="mb-4 text-destructive">{error instanceof Error ? error.message : 'Não foi possível consultar o Contencioso.'}</p><Button variant="outline" onClick={() => void router.invalidate()}><RefreshCw/>Tentar novamente</Button></div>;
}