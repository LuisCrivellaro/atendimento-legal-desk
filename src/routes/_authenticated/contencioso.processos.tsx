import { createFileRoute } from '@tanstack/react-router';
import type { SearchSchemaInput } from '@tanstack/react-router';
import { filtrosContencioso } from '@/lib/contencioso';
import type { FiltrosContencioso } from '@/lib/contencioso';
import { contenciosoQuery } from '@/lib/contencioso-query';
import { ContenciosoPage, ContenciosoError } from '@/components/office/contencioso';
export const Route = createFileRoute('/_authenticated/contencioso/processos')({
  validateSearch: (s: Partial<FiltrosContencioso> & SearchSchemaInput) => filtrosContencioso.parse(s), loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(contenciosoQuery(deps, 'processos')),
  head: () => ({ meta: [{ title: 'Processos — Manager ADV' }, { name: 'description', content: 'Processos reais da carteira ProJuris com histórico e sincronização no Manager ADV.' }, { property: 'og:title', content: 'Processos — Manager ADV' }, { property: 'og:description', content: 'Carteira processual e históricos disponíveis no ProJuris.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: () => <ContenciosoPage filtros={Route.useSearch()} modo="processos"/>,
  errorComponent: ContenciosoError, notFoundComponent: () => <p className="p-8">Processos não encontrados.</p>,
});