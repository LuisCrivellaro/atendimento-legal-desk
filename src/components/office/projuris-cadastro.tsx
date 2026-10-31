import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Pencil, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { obterClienteProjuris, atualizarClienteProjuris } from '@/lib/projuris-clientes.functions';
import { CAMPOS_CADASTRO, CAMPOS_ENDERECO, registroCadastro, colecaoCadastro, type AlteracaoCadastro } from '@/lib/projuris/cadastro';
import { dataCadastro } from '@/lib/projuris/diretorio';

const rotulo = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
function Valor({ valor }: { valor: unknown }) {
  if (valor === null || valor === undefined || valor === '') return <span className="text-muted-foreground">Não informado</span>;
  if (typeof valor === 'boolean') return <>{valor ? 'Sim' : 'Não'}</>;
  if (Array.isArray(valor)) return valor.length ? <div className="space-y-2">{valor.map((v, i) => <div key={i} className="border-l pl-3"><Valor valor={v}/></div>)}</div> : <span className="text-muted-foreground">Nenhum registro</span>;
  if (typeof valor === 'object') {
    const r = registroCadastro(valor);
    if (typeof r['valor'] === 'string') return <>{r['valor']}</>;
    return <dl className="space-y-2">{Object.entries(r).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{rotulo(k)}</dt><dd className="break-words"><Valor valor={v}/></dd></div>)}</dl>;
  }
  return <>{String(valor)}</>;
}

export function ProjurisCadastro({ codigo }: { codigo: number }) {
  const ler = useServerFn(obterClienteProjuris);
  const salvar = useServerFn(atualizarClienteProjuris);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['projuris-cadastro', codigo], queryFn: async () => { const r = await ler({ data: { codigo } }); return { ...r, cadastro: registroCadastro(JSON.parse(r.cadastroJson)), processos: (JSON.parse(r.processosJson) as unknown[]).map(registroCadastro) }; }, retry: false });
  const [edicao, setEdicao] = useState<{ titulo: string; alteracao: AlteracaoCadastro } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const editar = (titulo: string, alteracao: AlteracaoCadastro) => setEdicao({ titulo, alteracao });
  const comando = (titulo: string, alteracao: AlteracaoCadastro) => <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`Editar ${titulo}`} disabled={busy} onClick={() => editar(titulo, alteracao)}><Pencil className="size-3.5"/></Button>;
  return <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{d?.cliente.nomeExibicao ?? 'Cadastro ProJuris'}</DialogTitle></DialogHeader>
    {q.isPending ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin"/>Consultando cadastro…</p> : q.error || !d ? <p role="alert" className="text-sm text-destructive">Não foi possível abrir o cadastro do ProJuris. <Button variant="link" onClick={() => void q.refetch()}>Tentar novamente</Button></p> : <>
      {edicao && <form className="space-y-3 border-y py-4" onSubmit={e => { e.preventDefault(); if (busy) return; setBusy(true); void (async () => {
        try { await salvar({ data: { codigo, revisao: d.revisao, alteracao: edicao.alteracao } }); setEdicao(null); await Promise.all([qc.invalidateQueries({ queryKey: ['projuris-clientes'] }), qc.invalidateQueries({ queryKey: ['projuris-cadastro', codigo] }), qc.invalidateQueries({ queryKey: ['projuris-nomes-conversas'] })]); toast.success('Alteração confirmada no ProJuris.'); }
        catch (erro) { toast.error(erro instanceof Error ? erro.message : 'Não foi possível confirmar a alteração.'); }
        finally { setBusy(false); }
      })(); }}><label className="block text-sm font-medium" htmlFor="projuris-edicao">{edicao.titulo}</label><Input id="projuris-edicao" autoFocus value={edicao.alteracao.valor} type={edicao.alteracao.tipo === 'email' ? 'email' : 'text'} disabled={busy} onChange={e => setEdicao({ ...edicao, alteracao: { ...edicao.alteracao, valor: e.target.value } })}/><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEdicao(null)}><X/>Cancelar</Button><Button disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <Save/>}Salvar no ProJuris</Button></div></form>}
      <Tabs defaultValue="cadastro"><TabsList className="mb-4"><TabsTrigger value="cadastro">Cadastro</TabsTrigger><TabsTrigger value="contatos">Telefones e endereços</TabsTrigger><TabsTrigger value="processos">Processos ({d.processos.length})</TabsTrigger><TabsTrigger value="todos">Demais dados</TabsTrigger></TabsList>
        <TabsContent value="cadastro"><dl className="grid gap-4 sm:grid-cols-2">{Object.entries(CAMPOS_CADASTRO).map(([k, titulo]) => <div key={k} className="border-b pb-3"><dt className="flex items-center justify-between text-xs text-muted-foreground">{titulo}{comando(titulo, { tipo: 'cadastro', campo: k as keyof typeof CAMPOS_CADASTRO, valor: String(d.cadastro[k] ?? '') })}</dt><dd className="break-words text-sm"><Valor valor={d.cadastro[k]}/></dd></div>)}<div><dt className="text-xs text-muted-foreground">Cadastrado em</dt><dd className="text-sm">{dataCadastro(d.cadastro['dataInclusao'])?.split('-').reverse().join('/') ?? 'Não informado'}</dd></div></dl></TabsContent>
        <TabsContent value="contatos" className="space-y-5">
          <section><h3 className="mb-2 text-base font-semibold">Telefones</h3>{colecaoCadastro(d.cadastro, 'pessoaTelefonesWs', 'pessoaTelefoneWs').map((r, i) => { const t = registroCadastro(r['telefone']); return <div key={i} className="flex items-center justify-between border-b py-3 text-sm"><span>{String(t['numeroTelefone'] ?? '')}{r['principal'] === true ? ' · Principal' : ''}</span>{typeof r['codigoPessoaTelefone'] === 'number' && comando('Telefone', { tipo: 'telefone', codigo: r['codigoPessoaTelefone'], valor: String(t['numeroTelefone'] ?? '') })}</div>; })}<p className="text-sm text-muted-foreground">{!colecaoCadastro(d.cadastro, 'pessoaTelefonesWs', 'pessoaTelefoneWs').length ? String(d.cadastro['telefone'] ?? 'Nenhum telefone cadastrado.') : ''}</p></section>
          <section><h3 className="mb-2 text-base font-semibold">E-mails</h3>{colecaoCadastro(d.cadastro, 'pessoaEmailsWs', 'pessoaEmailWs').map((r, i) => <div key={i} className="flex items-center justify-between border-b py-3 text-sm"><span className="break-all">{String(r['email'] ?? '')}{r['principal'] === true ? ' · Principal' : ''}</span>{typeof r['codigoEmail'] === 'number' && comando('E-mail', { tipo: 'email', codigo: r['codigoEmail'], valor: String(r['email'] ?? '') })}</div>)}{!colecaoCadastro(d.cadastro, 'pessoaEmailsWs', 'pessoaEmailWs').length && <p className="text-sm text-muted-foreground">{String(d.cadastro['email'] ?? 'Nenhum e-mail cadastrado.')}</p>}</section>
          <section><h3 className="mb-2 text-base font-semibold">Endereços</h3>{colecaoCadastro(d.cadastro, 'pessoaEnderecosWs', 'pessoaEnderecoWs').map((r, i) => { const e = registroCadastro(r['enderecoWs']); return <dl key={i} className="mb-5 grid gap-3 border-b pb-4 sm:grid-cols-2">{Object.entries(CAMPOS_ENDERECO).map(([k, titulo]) => <div key={k}><dt className="flex items-center justify-between text-xs text-muted-foreground">{titulo}{typeof r['codigoPessoaEndereco'] === 'number' && comando(titulo, { tipo: 'endereco', codigo: r['codigoPessoaEndereco'], campo: k as keyof typeof CAMPOS_ENDERECO, valor: String(e[k] ?? '') })}</dt><dd className="text-sm"><Valor valor={e[k]}/></dd></div>)}<div><dt className="text-xs text-muted-foreground">Cidade / Estado</dt><dd className="text-sm"><Valor valor={e['cidadeEndereco']}/> / <Valor valor={e['estadoEndereco']}/></dd></div></dl>; })}{!colecaoCadastro(d.cadastro, 'pessoaEnderecosWs', 'pessoaEnderecoWs').length && <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>}</section>
        </TabsContent>
        <TabsContent value="processos">{d.processos.map((p, i) => <details key={i} className="border-b py-4"><summary className="cursor-pointer text-sm font-medium">Processo {String(p['codigoProcesso'])} · <Valor valor={p['situacaoProcesso']}/> · {String(p['assunto'] ?? 'Assunto não informado')}</summary><div className="mt-4 text-sm"><Valor valor={p}/></div></details>)}</TabsContent>
        <TabsContent value="todos"><div className="text-sm"><Valor valor={d.cadastro}/></div></TabsContent>
      </Tabs>
    </>}
  </DialogContent>;
}