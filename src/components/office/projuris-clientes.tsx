import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { listarClientesProjuris } from '@/lib/projuris-clientes.functions';
import type { ClienteProjurisDiretorio } from '@/lib/projuris/diretorio';
import { Empty } from './shared';
import { dataHoraCurta } from '@/lib/atendimento';
import { ProjurisCadastro } from './projuris-cadastro';
import { useRouterState } from '@tanstack/react-router';


export function ProjurisClientes() {
  const selecionado = useRouterState({ select: s => new URLSearchParams(s.location.searchStr).get('clientId') });
  const codigoSelecionado = selecionado && /^\d+$/.test(selecionado) ? Number(selecionado) : null;
  const [selecionadoFechado, setSelecionadoFechado] = useState<string | null>(null);
  const listar = useServerFn(listarClientesProjuris);
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<ClienteProjurisDiretorio | null>(null);
  useEffect(() => { const t = setTimeout(() => { setBusca(texto); setPagina(0); }, 300); return () => clearTimeout(t); }, [texto]);
  const q = useQuery({ queryKey: ['projuris-clientes', busca, pagina], queryFn: () => listar({ data: { busca, pagina, atualizar: false } }), placeholderData: keepPreviousData, staleTime: 60000 });
  const [atualizando, setAtualizando] = useState(false);
  const atualizar = async () => { setAtualizando(true); try { await listar({ data: { busca, pagina: 0, atualizar: true } }); setPagina(0); await q.refetch(); } finally { setAtualizando(false); } };
  const d = q.data;
  const paginas = d?.ok ? Math.max(1, Math.ceil(d.total / 50)) : 1;
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Buscar no ProJuris" className="pl-9" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Nome, CPF/CNPJ, telefone, e-mail ou cidade…"/></div>
      <Button variant="outline" onClick={() => void atualizar()} disabled={atualizando || q.isFetching}><RefreshCw className={atualizando ? 'animate-spin' : ''}/>Atualizar do ProJuris</Button>
    </div>
    {q.isPending ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Consultando a base CS.IA…</p>
      : !d || !d.ok ? <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">{d && !d.ok ? d.erro : 'Não foi possível consultar o ProJuris.'}</p>
      : <>
        <p className="mb-2 text-xs text-muted-foreground">{d.totalProjuris} clientes com processos ativos · cadastro desde 01/01/2025 · {d.total} encontrados · sincronizado {dataHoraCurta(d.atualizadoEm)}</p>
        {d.erroSync && <p role="alert" className="mb-3 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">{d.erroSync} Dados anteriores preservados.</p>}
        {d.semData > 0 && <p className="mb-2 text-2xs text-muted-foreground">{d.semData} cadastros sem data válida não incluídos.</p>}
        {!d.itens.length ? <Empty text="Nenhuma pessoa encontrada no ProJuris."/> : <div className="superficie overflow-x-auto"><table className="tabela-dados min-w-[860px]"><thead><tr>{['Nome', 'CPF / CNPJ', 'Telefone / E-mail', 'Cidade', 'Situação', ''].map((h, i) => <th key={i} scope="col">{h || <span className="sr-only">Ações</span>}</th>)}</tr></thead>
          <tbody>{d.itens.map(c => <tr key={c.codigo}><td className="max-w-72 font-medium">{c.nomeExibicao ?? c.nome}<p className="mt-0.5 text-2xs font-normal text-muted-foreground">{c.processosAtivos} processos ativos{!c.acoes ? ' · Classificação a conferir' : ''}</p>{c.nomePendencia && <p className="mt-0.5 text-2xs font-normal text-pending-foreground">Nome incompleto: {c.nomePendencia}</p>}</td><td className="whitespace-nowrap tabular-nums">{c.cpfCnpj ?? <span className="text-muted-foreground">Não informado</span>}</td><td><div className="flex items-center gap-1 whitespace-nowrap tabular-nums">{c.telefone ?? <span className="text-muted-foreground">Não informado</span>}{c.telefone && <Button size="icon-sm" variant="ghost" className="-my-2 text-muted-foreground hover:text-accent-foreground" title="Copiar telefone" aria-label={`Copiar telefone de ${c.nome}`} onClick={() => void navigator.clipboard.writeText(c.telefone ?? '').then(() => toast.success('Telefone copiado.')).catch(() => toast.error('Não foi possível copiar o telefone.'))}><Copy className="size-3.5"/></Button>}</div><p className="text-2xs text-muted-foreground">{c.email ?? ''}</p></td><td>{[c.cidade, c.estado].filter(Boolean).join(' / ') || '—'}</td><td><Badge variant={c.habilitado ? 'success' : 'secondary'}>{c.habilitado ? 'Habilitado' : 'Desabilitado'}</Badge></td><td className="text-right"><Button size="sm" variant="outline" onClick={() => setAberto(c)}>Ver dados</Button></td></tr>)}</tbody></table></div>}
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground"><Button size="icon-sm" variant="outline" aria-label="Página anterior" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}><ChevronLeft/></Button><span className="tabular-nums">Página {pagina + 1} de {paginas}</span><Button size="icon-sm" variant="outline" aria-label="Próxima página" disabled={pagina + 1 >= paginas} onClick={() => setPagina(p => p + 1)}><ChevronRight/></Button></div>
      </>}
    <Dialog open={!!aberto || !!codigoSelecionado && selecionadoFechado !== selecionado} onOpenChange={v => { if (!v) { setAberto(null); setSelecionadoFechado(selecionado); } }}>{(aberto || codigoSelecionado && selecionadoFechado !== selecionado) && <ProjurisCadastro key={aberto?.codigo ?? codigoSelecionado} codigo={aberto?.codigo ?? codigoSelecionado ?? 0}/>}</Dialog>
  </div>;
}
