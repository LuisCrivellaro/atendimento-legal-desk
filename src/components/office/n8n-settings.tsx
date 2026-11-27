import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { endpoints } from '@/services/integracoes';
import { lerAuditLog } from '@/lib/atendimento/envio.functions';
import { Section } from './shared';
import { dataHoraCurta } from '@/lib/atendimento';

export function N8nSettings({ allowed }: { allowed: boolean }) {
  const read = useServerFn(lerAuditLog);
  const log = useQuery({ queryKey: ['audit-log'], queryFn: () => read(), enabled: allowed, refetchInterval: 30000 });
  return <>
    <Section title="Conexão n8n">
      <p className="mb-3 text-sm text-muted-foreground">Integração n8n ainda não conectada · ações externas simuladas</p>
      <div className="superficie overflow-x-auto"><table className="tabela-dados">
        <caption className="border-b px-3 py-2 text-left text-xs font-semibold text-foreground">Endpoints por ação</caption>
        <thead><tr><th scope="col">Ação</th><th scope="col">Caminho</th></tr></thead>
        <tbody>{Object.entries(endpoints).map(([action, path]) => <tr key={action}><td className="whitespace-nowrap">{action}</td><td className="break-all font-mono text-2xs text-muted-foreground">{path}</td></tr>)}</tbody>
      </table></div>
    </Section>
    <Section title="Log de auditoria">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Registros do escritório · ações mais recentes primeiro</p>
        <Button size="icon-sm" variant="outline" title="Atualizar log" aria-label="Atualizar log" disabled={!allowed} onClick={() => void log.refetch()}><RefreshCw className={log.isFetching ? 'animate-spin' : ''} /></Button>
      </div>
      {allowed ? <div className="superficie max-h-[28rem] overflow-auto"><table className="tabela-dados min-w-[650px]">
        <thead><tr>{['Data e hora', 'Usuário / perfil', 'Ação', 'Resumo', 'Resultado'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{(log.data ?? []).map(row => <tr key={row.id}>
          <td className="whitespace-nowrap tabular-nums">{dataHoraCurta(row.criado_em)}</td>
          <td>{row.ator}<p className="text-2xs text-muted-foreground">{row.perfil}</p></td>
          <td>{row.acao}</td>
          <td>{row.resumo || row.erro}</td>
          <td><Badge variant={row.status === 'sucesso' ? 'success' : 'destructive'}>{row.status}</Badge></td>
        </tr>)}</tbody>
      </table>{log.data && !log.data.length && <p className="border-t py-6 text-center text-sm text-muted-foreground">Nenhuma ação registrada.</p>}{log.isLoading && <p role="status" className="border-t py-6 text-center text-sm text-muted-foreground">Carregando log…</p>}</div> : <p className="superficie px-4 py-3 text-sm text-muted-foreground">Seu perfil não permite esta ação.</p>}
    </Section>
  </>;
}
