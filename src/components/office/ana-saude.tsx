import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { lerSaudeAna } from '@/lib/monitoramento/saude.functions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const fmt = (v?: string | null) => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const cor = { ok: 'default', atencao: 'secondary', falha: 'destructive' } as const;
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
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div><CardTitle>Monitoramento 24h da Anne</CardTitle><p className="text-sm text-muted-foreground">Verificado automaticamente a cada 5 minutos pelo servidor · último: {fmt(s?.verificadoEm)}</p></div>
        <div className="flex items-center gap-2">{s && <Badge variant={cor[s.geral]}>{rot[s.geral]}</Badge>}<Button size="sm" variant="outline" disabled={agora.isPending} onClick={() => agora.mutate()}>{agora.isPending ? 'Verificando…' : 'Verificar agora'}</Button></div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!s ? <p className="text-sm text-muted-foreground">Nenhuma verificação registrada ainda.</p> : <>
          {s.alertas.length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"><strong>Alertas:</strong><ul className="list-disc pl-5">{s.alertas.map(a => <li key={a}>{a}</li>)}</ul></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ind.map(([k, v]) => <div key={k} className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="font-medium">{v}</div></div>)}</div>
          <div className="grid gap-2 sm:grid-cols-2">{s.servicos.map(x => <div key={x.nome} className="flex items-center justify-between rounded-md border p-2 text-sm"><div><div className="font-medium">{x.nome}</div><div className="text-muted-foreground">{x.detalhe}</div></div><Badge variant={cor[x.estado]}>{rot[x.estado]}</Badge></div>)}</div>
          {!!q.data.historico?.length && <div className="text-sm"><div className="mb-1 font-medium">Histórico de alertas</div>{q.data.historico.map(h => <div key={h.criado_em} className="text-muted-foreground">{fmt(h.criado_em)} · {h.resumo}</div>)}</div>}
        </>}
      </CardContent>
    </Card>
  );
}
