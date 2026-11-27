import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { lerSaudeAna } from '@/lib/monitoramento/saude.functions';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const fmt = (v?: string | null) => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
// Estados em etiqueta suave: normal em verde, atenção em âmbar, falha em vermelho.
const cor = { ok: 'success', atencao: 'warning', falha: 'destructive' } as const;
const rot = { ok: 'Normal', atencao: 'Atenção', falha: 'Falha' } as const;

export function AnaSaudePanel() {
  const ler = useServerFn(lerSaudeAna);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ana-saude'], queryFn: () => ler({ data: {} }) });
  const agora = useMutation({ mutationFn: () => ler({ data: { agora: true } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['ana-saude'] }) });
  if (!q.data?.autorizado) return null;
  const s = q.data.saude;
  const ind: [string, string][] = s ? [
    ['Última execução bem-sucedida', fmt(s.ultimaExecucaoOk)], ['Última mensagem recebida', fmt(s.ultimaRecebida)], ['Última mensagem enviada', fmt(s.ultimaEnviada)],
    ['Erros nas últimas 24h', String(s.errosUltimas24h)], ['Mensagens pendentes', `${s.pendentes}${s.incertas ? ` · ${s.incertas} incertas` : ''}`], ['Consumo de IA hoje', `${s.ia.chamadasHoje} / ${s.ia.limite} chamadas`],
  ] : [];
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b py-3">
        <div className="min-w-0"><h2 className="section-title">Monitoramento 24h da Anne</h2><p className="text-xs text-muted-foreground">Verificado automaticamente a cada 5 minutos pelo servidor · último: {fmt(s?.verificadoEm)}</p></div>
        <div className="flex items-center gap-2">{s && <Badge variant={cor[s.geral]}>{rot[s.geral]}</Badge>}<Button size="sm" variant="outline" disabled={agora.isPending} onClick={() => agora.mutate()}><RefreshCw className={agora.isPending ? 'animate-spin' : ''}/>{agora.isPending ? 'Verificando…' : 'Verificar agora'}</Button></div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {!s ? <p className="text-sm text-muted-foreground">Nenhuma verificação registrada ainda.</p> : <>
          {s.alertas.length > 0 && <div role="alert" className="flex gap-2 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive"/><div><strong className="font-semibold">Alertas:</strong><ul className="list-disc pl-5">{s.alertas.map(a => <li key={a}>{a}</li>)}</ul></div></div>}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{ind.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-2xs text-muted-foreground">{k}</dt><dd className="text-sm font-medium tabular-nums">{v}</dd></div>)}</dl>
          <ul className="grid gap-x-6 border-t sm:grid-cols-2">{s.servicos.map(x => <li key={x.nome} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><div className="min-w-0"><div className="font-medium">{x.nome}</div><div className="text-xs text-muted-foreground">{x.detalhe}</div></div><Badge variant={cor[x.estado]}>{rot[x.estado]}</Badge></li>)}</ul>
          {!!q.data.historico?.length && <div className="text-sm"><h3 className="mb-1 text-xs font-semibold">Histórico de alertas</h3><ul className="space-y-0.5 text-xs text-muted-foreground">{q.data.historico.map(h => <li key={h.criado_em}><span className="tabular-nums">{fmt(h.criado_em)}</span> · {h.resumo}</li>)}</ul></div>}
        </>}
      </CardContent>
    </Card>
  );
}
