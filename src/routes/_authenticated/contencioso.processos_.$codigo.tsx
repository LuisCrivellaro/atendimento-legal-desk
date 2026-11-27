import { createFileRoute } from '@tanstack/react-router';
import type { SearchSchemaInput } from '@tanstack/react-router';
import { filtrosContencioso } from '@/lib/contencioso';
import type { FiltrosContencioso } from '@/lib/contencioso';
import { contenciosoQuery } from '@/lib/contencioso-query';
import { ContenciosoPage, ContenciosoError } from '@/components/office/contencioso';
import { paginaClasse } from '@/components/office/shared';
export const Route = createFileRoute('/_authenticated/contencioso/processos_/$codigo')({
  validateSearch: (s: Partial<FiltrosContencioso> & SearchSchemaInput) => filtrosContencioso.parse(s), loaderDeps: ({ search }) => search,
  loader: ({ context, deps, params }) => context.queryClient.ensureQueryData(contenciosoQuery(deps, 'ficha', Number(params.codigo))),
  head: ({ loaderData }) => ({ meta: [{ title: `Linha do tempo ${loaderData?.ficha?.numero ?? 'processual'} — Manager ADV` }, { name: 'description', content: 'Dados processuais e histórico original disponível pela API ProJuris.' }, { property: 'og:title', content: `Linha do tempo ${loaderData?.ficha?.numero ?? 'processual'} — Manager ADV` }, { property: 'og:description', content: 'Histórico original, vinculação ao cliente e sincronização individual.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: () => <ContenciosoPage filtros={Route.useSearch()} codigo={Number(Route.useParams().codigo)} modo="ficha"/>,
  errorComponent: ContenciosoError, notFoundComponent: () => <p className={`${paginaClasse} text-sm text-muted-foreground`}>Processo não encontrado.</p>,
});