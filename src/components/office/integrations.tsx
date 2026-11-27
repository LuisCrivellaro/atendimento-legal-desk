import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Plug, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { integrationCatalog } from '@/lib/integration-readiness';
import { readIntegrationReadiness } from '@/lib/integrations.functions';
import { Section } from './shared';

export function Integrations({ userId }: { userId: string }) {
  const read = useServerFn(readIntegrationReadiness);
  const query = useQuery({ queryKey: ['integration-readiness', userId], queryFn: () => read() });
  return <Section title="Integrações preparadas">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success"/>Envios, cobranças e assinaturas reais: bloqueados</p>
      <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''}/>Atualizar situação</Button>
    </div>
    {query.isError && <p role="alert" className="mb-3 rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">Não foi possível conferir as credenciais. Nenhuma integração foi ativada.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {integrationCatalog.map(service => {
        const status = query.data?.find(item => item.id === service.id);
        return <article key={service.id} className="superficie flex flex-col p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-md font-semibold">{service.name}</h3><Plug aria-hidden="true" className="size-4 text-muted-foreground"/></div>
          <p className="mt-1 text-xs text-muted-foreground">{service.purpose}</p>
          <Badge variant={!status ? 'secondary' : status.credentialsPresent ? 'default' : 'warning'} className="mt-3 h-auto min-h-5 self-start whitespace-normal py-0.5 leading-4">{!status ? 'Situação não conferida' : status.credentialsPresent ? 'Credencial presente · ativação pendente' : 'Aguardando credenciais'}</Badge>
          {status?.missing.map(label => <p key={label} className="mt-1.5 text-2xs text-muted-foreground">Pendente: {label}</p>)}
          {service.id === 'claude' && <p className="mt-1.5 text-2xs text-muted-foreground">Claude Sonnet 5 · IA atual mantida</p>}
          <div className="mt-auto pt-4"><Button asChild variant="outline" size="sm"><a href={service.documentation} target="_blank" rel="noopener noreferrer"><ExternalLink/>Documentação</a></Button></div>
        </article>;
      })}
    </div>
  </Section>;
}