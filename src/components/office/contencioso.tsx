import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Link, defaultParseSearch, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Search, Loader2, Scale, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Empty, paginaClasse } from './shared';
import { contenciosoQuery } from '@/lib/contencioso-query';
import { sincronizarProjurisManual } from '@/lib/projuris-sync.functions';
import { dataLegivel } from '@/lib/projuris/processos';
import { dataHoraCurta } from '@/lib/atendimento';
import type { FiltrosContencioso } from '@/lib/contencioso';
import { filtrosContencioso } from '@/lib/contencioso';
// Lê os filtros com o mesmo formato do roteador: uma busca só com números (CPF, CNJ) vem entre aspas na URL e,
// lida como texto cru, chegava à tela e ao servidor com as aspas. Textos ficam texto; só a página é número.
const paramsDaUrl = (str: string) => Object.fromEntries(Object.entries(defaultParseSearch(str) as Record<string, unknown>).map(([k, v]) => [k, k === 'pagina' || typeof v === 'string' ? v : v == null ? '' : String(v)]));
import { toast } from 'sonner';

export function ContenciosoPage({ filtros: filtrosIniciais, modo, codigo }: { filtros: FiltrosContencioso; modo: 'processos' | 'andamentos' | 'ficha'; codigo?: number }) {
  const searchStr = useRouterState({ select: s => s.location.searchStr });
  const filtros = filtrosContencioso.parse({ ...filtrosIniciais, ...paramsDaUrl(searchStr) });
  // CO-04: a lista atual continua na tela (com indicador) enquanto a dos novos filtros carrega; os campos já mostram os filtros novos.
  const searchStrDados = useDeferredValue(searchStr); const atualizando = searchStrDados !== searchStr;
  const filtrosDados = atualizando ? filtrosContencioso.parse({ ...filtrosIniciais, ...paramsDaUrl(searchStrDados) }) : filtros;
  const { data: d } = useSuspenseQuery(contenciosoQuery(filtrosDados, modo, codigo));
  const navigate = useNavigate(); const qc = useQueryClient(); const sincronizar = useServerFn(sincronizarProjurisManual);
  const [busy, setBusy] = useState(false); const [progresso, setProgresso] = useState('');
  const alterar = (mudanca: Partial<FiltrosContencioso>) => {
    const search = { ...filtros, pagina: 0, ...mudanca };
    if (modo === 'ficha' && codigo) void navigate({ to: '/contencioso/processos/$codigo', params: { codigo: String(codigo) }, search });
    else if (modo === 'andamentos') void navigate({ to: '/contencioso/andamentos', search });
    else void navigate({ to: '/contencioso/processos', search });
  };
  // CO-04: a busca fica no campo enquanto se digita e só vai para a URL (recarregando a lista) após 300 ms sem teclar.
  const [busca, setBusca] = useState(filtros.busca); const buscaEnviada = useRef(filtros.busca);
  const alterarRef = useRef(alterar); useEffect(() => { alterarRef.current = alterar; });
  useEffect(() => { if (filtros.busca !== buscaEnviada.current) { buscaEnviada.current = filtros.busca; setBusca(filtros.busca); } }, [filtros.busca]);
  useEffect(() => {
    if (busca === buscaEnviada.current) return;
    const t = window.setTimeout(() => { buscaEnviada.current = busca; alterarRef.current({ busca }); }, 300);
    return () => window.clearTimeout(t);
  }, [busca]);
  const limparFiltros = () => { buscaEnviada.current = ''; setBusca(''); alterar({ busca: '', cliente: '', tribunal: '', situacao: '', processo: '', inicio: '', fim: '' }); };
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
  return <div className={paginaClasse}>
    {modo === 'ficha' && <Button asChild variant="ghost" size="sm" className="-ml-2.5 mb-2"><Link to="/contencioso/processos"><ArrowLeft/>Processos</Link></Button>}
    <PageHeader title={modo === 'processos' ? 'Processos' : modo === 'andamentos' ? 'Andamentos processuais' : d.ficha?.numero ?? 'Processo — número não informado'}>
      {modo === 'ficha' ? <Button disabled={busy} onClick={() => void atualizar('individual')}><RefreshCw className={busy ? 'animate-spin' : ''}/>Sincronizar processo</Button> : <>
        <Button variant="outline" disabled={busy} onClick={() => void atualizar('cadastros')}><RefreshCw/>Importar / atualizar processos</Button>
        <Button disabled={busy || !d.fila.length} onClick={() => void atualizar('geral')}>{busy ? <Loader2 className="animate-spin"/> : <RefreshCw/>}Sincronizar históricos</Button>
      </>}
    </PageHeader>
    {/* Abas do Contencioso: controle segmentado (a aba ativa em branco sobre o fundo neutro). */}
    <nav className="mb-4 inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1" aria-label="Contencioso">
      <Button asChild size="sm" variant="ghost" className={modo !== 'andamentos' ? 'bg-card text-foreground shadow-xs hover:bg-card' : 'text-muted-foreground hover:bg-card/60'}><Link to="/contencioso/processos"><Scale/>Processos</Link></Button>
      <Button asChild size="sm" variant="ghost" className={modo === 'andamentos' ? 'bg-card text-foreground shadow-xs hover:bg-card' : 'text-muted-foreground hover:bg-card/60'}><Link to="/contencioso/andamentos"><FileText/>Andamentos processuais</Link></Button>
    </nav>
    <section aria-label="Sincronização do Contencioso" className="mb-5">
      <dl className="faixa-indicadores">{[['Processos importados', d.painel.processos], ['Andamentos sincronizados', d.painel.andamentos], ['Históricos pendentes', d.painel.pendentes], ['Falhas', d.painel.falhas]].map(([label, valor]) => <div key={label} className="indicador"><dt className="indicador-rotulo order-2">{label}</dt><dd className={`indicador-valor ${label === 'Falhas' && Number(valor) > 0 ? 'text-destructive' : ''}`}>{valor}</dd></div>)}</dl>
      <p className="mt-2 text-2xs text-muted-foreground">Cadastro: {d.painel.ultima ? dataHoraCurta(d.painel.ultima) : 'não sincronizado'} · Último histórico: {d.painel.historicoEm ? dataHoraCurta(d.painel.historicoEm) : 'não sincronizado'}</p>
      {busy && <p className="mt-2 flex items-center gap-2 text-sm" role="status"><Loader2 className="size-4 animate-spin text-primary"/>{progresso}</p>}
      {d.painel.erro && <p role="alert" className="mt-3 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">{d.painel.erro}</p>}
      {!!d.falhas.length && <details className="group mt-3 text-sm"><summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md font-medium text-destructive-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-90"/>Falhas de sincronização ({d.falhas.length})</summary><ul className="superficie mt-2 divide-y">{d.falhas.map(f => <li key={f.codigo} className="px-4 py-2.5"><Link className="font-medium text-primary underline-offset-2 hover:underline" to="/contencioso/processos/$codigo" params={{ codigo: String(f.codigo) }}>{f.numero ?? 'Número não informado'}</Link><p>{f.erro} · {f.falhas} tentativa(s)</p><p className="text-2xs text-muted-foreground">{f.tentativaEm ? dataHoraCurta(f.tentativaEm) : 'Data não informada'}{f.retryEm ? ` · nova tentativa elegível a partir de ${dataHoraCurta(f.retryEm)}` : ''}</p></li>)}</ul></details>}
    </section>
    {d.ficha && <>
      <h2 className="section-title mb-3">{d.ficha.clientes.map(c => c.nome).join(' / ')}</h2>
      <dl className="superficie mb-6 grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{[
        ['CPF/CNPJ', d.ficha.clientes.map(c => c.cpfCnpj ?? 'Não informado').join(' / ')], ['Tribunal', d.ficha.tribunal], ['Vara', d.ficha.vara], ['Classe', d.ficha.classe], ['Assunto', d.ficha.assunto], ['Polo do cliente', d.ficha.clientes.map(c => c.polo ?? 'Não informado').join(' / ')], ['Situação', d.ficha.situacao], ['Última movimentação', dataLegivel(d.ficha.ultimaMovimentacao ?? undefined)], ['Andamentos disponíveis', String(d.ficha.quantidade)],
      ].map(([label, valor]) => <div key={label} className="min-w-0"><dt className="text-2xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words text-sm">{valor || <span className="text-muted-foreground">Não informado pela API</span>}</dd></div>)}</dl>
      <h2 className="section-title mb-3">Linha do tempo</h2>
      {!d.ficha.sincronizadoEm && <p className="mb-3 text-sm text-muted-foreground">Histórico ainda não importado.</p>}
    </>}
    {/* Filtros numa grade alinhada pela base: todos os campos com 36px, rótulos de 12px só onde o campo precisa (datas e ordenação). */}
    <div className="mb-3 grid items-end gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
      {modo !== 'ficha' && <><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Pesquisar Contencioso" placeholder={modo === 'andamentos' ? 'Cliente, processo ou descrição' : 'Cliente, CPF/CNPJ ou CNJ'} className="pl-9 pr-9" maxLength={120} value={busca} onChange={e => setBusca(e.target.value)}/>{(busca !== filtros.busca || atualizando) && <Loader2 aria-hidden="true" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"/>}</div>
      <Filtro label="Cliente" valor={filtros.cliente} alterar={v => alterar({ cliente: v })} opcoes={d.opcoes.clientes.map(c => ({ valor: String(c.codigo), nome: c.nome }))}/>
      <Filtro label="Tribunal" valor={filtros.tribunal} alterar={v => alterar({ tribunal: v })} opcoes={d.opcoes.tribunais.map(t => ({ valor: t, nome: t }))}/>
      {modo === 'processos' ? <Filtro label="Situação" valor={filtros.situacao} alterar={v => alterar({ situacao: v })} opcoes={d.opcoes.situacoes.map(t => ({ valor: t, nome: t }))}/> : <Filtro label="Processo" valor={filtros.processo} alterar={v => alterar({ processo: v })} opcoes={d.referencias.map(p => ({ valor: String(p.codigo), nome: p.numero ?? 'Número não informado' }))}/>}</>}
      <div><Label htmlFor="contencioso-inicio" className="mb-1 block text-2xs font-normal text-muted-foreground">{modo === 'processos' ? 'Última movimentação — de' : 'Movimentação — de'}</Label><Input id="contencioso-inicio" type="date" value={filtros.inicio} onChange={e => alterar({ inicio: e.target.value })}/></div>
      <div><Label htmlFor="contencioso-fim" className="mb-1 block text-2xs font-normal text-muted-foreground">Até</Label><Input id="contencioso-fim" type="date" value={filtros.fim} onChange={e => alterar({ fim: e.target.value })}/></div>
      <div><Label className="mb-1 block text-2xs font-normal text-muted-foreground">Ordenação</Label><Select value={filtros.ordem} onValueChange={v => alterar({ ordem: v as FiltrosContencioso['ordem'] })}><SelectTrigger aria-label="Ordenação"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="recente">Mais recentes</SelectItem><SelectItem value="antigo">Mais antigos</SelectItem>{modo === 'processos' && <><SelectItem value="cliente">Cliente A–Z</SelectItem><SelectItem value="numero">Número CNJ</SelectItem></>}</SelectContent></Select></div>
      <Button variant="ghost" className="justify-self-start" onClick={limparFiltros}><X/>Limpar filtros</Button>
    </div>
    <div role="status" aria-live="polite" className="mb-2 h-0.5 overflow-hidden rounded-full">{atualizando && <><span className="sr-only">Atualizando resultados…</span><div aria-hidden="true" className="h-full w-full animate-pulse bg-primary"/></>}</div>
    {modo === 'processos' ? <div aria-busy={atualizando} className={`superficie overflow-x-auto transition-opacity ${atualizando ? 'opacity-60' : ''}`}><table className="tabela-dados min-w-[880px]"><thead><tr>{['Cliente / CPF ou CNPJ', 'Processo / Tribunal e vara', 'Classe / Assunto / Polo', 'Situação', 'Última movimentação', 'Andamentos', ''].map((t, i) => <th key={i} scope="col" className={i === 5 ? 'num' : i === 6 ? 'w-12' : undefined}>{t || <span className="sr-only">Ações</span>}</th>)}</tr></thead><tbody>{d.processos.itens.map(p => <tr key={p.codigo}><td className="max-w-64">{p.clientes.map(c => <div key={c.codigo} className="mb-1.5 last:mb-0"><Link to="/clientes" search={{ clientId: String(c.codigo) }} className="font-medium text-primary underline-offset-2 hover:underline">{c.nome}</Link><p className="text-2xs tabular-nums text-muted-foreground">{c.cpfCnpj ?? 'CPF/CNPJ não informado'}</p></div>)}</td><td className="max-w-64"><Link to="/contencioso/processos/$codigo" params={{ codigo: String(p.codigo) }} className="font-medium tabular-nums text-primary underline-offset-2 hover:underline">{p.numero ?? 'CNJ não informado'}</Link><p className="mt-0.5 text-2xs text-muted-foreground">{[p.tribunal, p.vara].filter(Boolean).join(' · ') || 'Tribunal/vara não informados'}</p></td><td className="max-w-52"><p>{p.classe ?? 'Classe não informada'}</p><p className="mt-0.5 text-2xs text-muted-foreground">{p.assunto ?? 'Assunto não informado'}</p><p className="mt-0.5 text-2xs">{p.clientes.map(c => c.polo).filter(Boolean).join(' / ') || 'Polo não informado'}</p></td><td><Badge variant="secondary">{p.situacao ?? 'Não informada'}</Badge>{p.erro && <p className="mt-1 text-2xs text-destructive">Falha na sincronização</p>}</td><td className="whitespace-nowrap tabular-nums">{dataLegivel(p.ultimaMovimentacao ?? undefined) ?? 'Não informada'}</td><td className="num tabular-nums">{p.sincronizadoEm ? p.quantidade : <span className="text-muted-foreground">Pendente</span>}</td><td className="text-right"><Button asChild size="icon-sm" variant="ghost"><Link aria-label={`Abrir processo ${p.numero ?? p.identificador ?? ''}`} to="/contencioso/processos/$codigo" params={{ codigo: String(p.codigo) }}><ArrowRight/></Link></Button></td></tr>)}</tbody></table>{!d.processos.itens.length && <p className="border-t py-10 text-center text-sm text-muted-foreground">Nenhum processo encontrado.</p>}</div> : <div aria-busy={atualizando} className={`transition-opacity ${atualizando ? 'opacity-60' : ''}`}>{d.movimentos.itens.length ? <ol className="superficie px-4 py-1">{d.movimentos.itens.map(a => <li key={`${a.codigoProcesso}:${a.codigo}`} className="relative ml-1 border-l py-3 pl-5">
      <span aria-hidden="true" className="absolute -left-[4.5px] top-[18px] size-2 rounded-full bg-primary"/>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium tabular-nums">{dataLegivel(a.data) ?? 'Data não informada'}{a.hora ? ` · ${a.hora.slice(0, 5)}` : ''}</span><Badge variant="secondary">{a.tipo ?? 'Tipo não informado'}</Badge>{a.privado && <Badge variant="warning">Privado · uso interno</Badge>}</div>
      {modo === 'andamentos' && <Link to="/contencioso/processos/$codigo" params={{ codigo: String(a.codigoProcesso) }} className="mb-1 block text-xs font-medium text-primary underline-offset-2 hover:underline">{d.referencias.find(p => p.codigo === a.codigoProcesso)?.clientes.map(c => c.nome).join(' / ')} · {d.referencias.find(p => p.codigo === a.codigoProcesso)?.numero ?? 'Número não informado'}</Link>}
      <p className="max-w-[80ch] whitespace-pre-wrap break-words text-sm leading-relaxed">{a.descricao}</p>
      <p className="mt-1 text-2xs text-muted-foreground">ProJuris API oficial</p>
    </li>)}</ol> : <Empty text="Nenhum andamento disponível para estes filtros."/>}</div>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs tabular-nums text-muted-foreground">{pagina.total} {modo === 'processos' ? 'processos' : 'andamentos'} · Página {pagina.pagina + 1} de {pagina.paginas}</p><div className="flex gap-2"><Button aria-label="Página anterior" variant="outline" size="icon-sm" disabled={atualizando || !pagina.pagina} onClick={() => alterar({ pagina: pagina.pagina - 1 })}><ChevronLeft/></Button><Button aria-label="Próxima página" variant="outline" size="icon-sm" disabled={atualizando || pagina.pagina + 1 >= pagina.paginas} onClick={() => alterar({ pagina: pagina.pagina + 1 })}><ChevronRight/></Button></div></div>
    <p className="mt-6 max-w-[100ch] border-t pt-3 text-2xs text-muted-foreground">Histórico acessível pela API oficial de andamentos. A consulta classificada apresentou erro 500; equivalência com “Visualizar todos” não comprovada. Documentos vinculados não estão disponíveis nesta consulta; nenhum arquivo é baixado por este módulo.</p>
  </div>;
}
function Filtro({ label, valor, alterar, opcoes }: { label: string; valor: string; alterar: (v: string) => void; opcoes: { valor: string; nome: string }[] }) {
  return <Select value={valor || '__todos'} onValueChange={v => alterar(v === '__todos' ? '' : v)}><SelectTrigger aria-label={label} className="w-full"><SelectValue placeholder={label}/></SelectTrigger><SelectContent><SelectItem value="__todos">{label}: todos</SelectItem>{opcoes.map(o => <SelectItem key={o.valor} value={o.valor}>{o.nome}</SelectItem>)}</SelectContent></Select>;
}
export function ContenciosoError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return <div className={paginaClasse}><PageHeader title="Contencioso"/><div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground"><span className="min-w-0">{error instanceof Error ? error.message : 'Não foi possível consultar o Contencioso.'}</span><Button variant="outline" size="sm" onClick={() => void router.invalidate()}><RefreshCw/>Tentar novamente</Button></div></div>;
}