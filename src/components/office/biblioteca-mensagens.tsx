import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { dataHoraCurta } from '@/lib/atendimento';
import { alterarAtivacaoMensagem, definirConsultaPaga, lerBibliotecaMensagens, salvarVersaoMensagem } from '@/lib/atendimento/biblioteca/biblioteca.functions';
import { executar } from '@/lib/executar';

const ROTULO_ATIVACAO = { ativo: 'Ativo', manual: 'Só a equipe (manual)', aguardando_aprovacao: 'Aguardando aprovação' } as const;

/**
 * Biblioteca oficial de mensagens (dentro de "Automações do atendimento"). A equipe vê o texto vigente, o gatilho, as
 * variáveis, o histórico de versões e o uso; só sênior/admin aprova nova versão, ativa/desativa e escolhe a consulta paga.
 */
export function BibliotecaMensagens() {
  const ler = useServerFn(lerBibliotecaMensagens);
  const salvar = useServerFn(salvarVersaoMensagem);
  const ativar = useServerFn(alterarAtivacaoMensagem);
  const consultaPaga = useServerFn(definirConsultaPaga);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['biblioteca-mensagens'], queryFn: () => ler(), staleTime: 30000, retry: false });
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const recarregar = () => qc.invalidateQueries({ queryKey: ['biblioteca-mensagens'] });
  if (isLoading) return <p className="pt-4 text-xs text-muted-foreground">Carregando mensagens oficiais…</p>;
  if (error || !data) return <p className="pt-4 text-xs text-destructive">Biblioteca de mensagens indisponível.</p>;
  return (
    <section aria-label="Mensagens oficiais" className="space-y-2 border-t pt-4 text-sm">
      <div>
        <h3 className="font-medium">Mensagens oficiais (CS Lawyers)</h3>
        <p className="text-xs text-muted-foreground">Textos fixos: a Anne só troca os campos entre colchetes por dados verificados e nunca reescreve. Faltou dado ou o texto não combina com a situação (ex.: "Bom dia" à tarde), a mensagem não sai.</p>
      </div>
      <label className="flex items-center justify-between gap-3 py-1">
        <span className="text-xs">Versão autorizada da consulta paga (07.2 ou 07.3)</span>
        <Select value={data.consultaPaga ?? 'nenhuma'} disabled={!data.podeEditar} onValueChange={v => void executar('Consulta paga', () => consultaPaga({ data: { versao: v === 'nenhuma' ? null : v as 'T07.2' | 'T07.3' } }), () => void recarregar())}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Versão autorizada da consulta paga"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhuma">Nenhuma</SelectItem>
            <SelectItem value="T07.2">07.2 — 18 anos</SelectItem>
            <SelectItem value="T07.3">07.3 — 20 anos</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {data.modelos.map(m => (
        <details key={m.id} className="rounded-md border px-2 py-1.5">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{m.id.replace('T', '')} · {m.titulo}</span>
            <span className="text-muted-foreground">v{m.versao} · {ROTULO_ATIVACAO[m.ativacao]}{m.uso.total ? ` · usada ${m.uso.total}×` : ''}</span>
          </summary>
          <div className="space-y-2 pt-2 text-xs">
            <p><span className="font-medium">Gatilho:</span> {m.gatilho}</p>
            <p><span className="font-medium">No sistema:</span> {m.integracao}</p>
            {!!m.variaveis.length && <p><span className="font-medium">Campos:</span> {m.variaveis.map(v => `${v} — ${m.fontes[v] ?? 'dado verificado'}`).join(' · ')}</p>}
            <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-sans text-xs">{m.texto}</pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void navigator.clipboard.writeText(m.texto).then(() => toast.success('Texto copiado'))}><Copy className="size-3.5" />Copiar</Button>
              {data.podeEditar && (
                <Select value={m.ativacao} onValueChange={v => void executar('Ativação da mensagem', () => ativar({ data: { id: m.id, ativacao: v as 'ativo' | 'manual' | 'aguardando_aprovacao' } }), () => void recarregar())}>
                  <SelectTrigger className="h-7 w-48 text-xs" aria-label={`Ativação do modelo ${m.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(ROTULO_ATIVACAO) as (keyof typeof ROTULO_ATIVACAO)[]).map(a => <SelectItem key={a} value={a}>{ROTULO_ATIVACAO[a]}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            {data.podeEditar && (
              <div className="space-y-1">
                <Textarea rows={4} className="text-xs" placeholder="Nova versão oficial (mesmos campos entre colchetes)" value={edicao[m.id] ?? ''} onChange={e => setEdicao(x => ({ ...x, [m.id]: e.target.value }))} />
                <Button size="sm" className="h-7 px-2 text-xs" disabled={!edicao[m.id]?.trim()} onClick={() => void executar('Aprovar nova versão', () => salvar({ data: { id: m.id, texto: edicao[m.id] ?? '' } }), () => { setEdicao(x => ({ ...x, [m.id]: '' })); void recarregar(); })}>Aprovar nova versão</Button>
              </div>
            )}
            {!!m.historico.length && (
              <div>
                <p className="font-medium">Histórico de versões</p>
                <ul className="list-disc pl-4">{[...m.historico].reverse().map(v => <li key={v.versao}>v{v.versao} · {v.autor} · {dataHoraCurta(v.em)}{v.motivo ? ` · ${v.motivo}` : ''}</li>)}</ul>
                <p className="text-muted-foreground">v1 = texto oficial recebido em 26/11/2026.</p>
              </div>
            )}
            {m.uso.ultimo && <p className="text-muted-foreground">Último uso: {dataHoraCurta(m.uso.ultimo)}</p>}
          </div>
        </details>
      ))}
      {data.atualizadoEm && <p className="text-xs text-muted-foreground">Última alteração por {data.atualizadoPor ?? 'equipe'} em {dataHoraCurta(data.atualizadoEm)}.</p>}
    </section>
  );
}
