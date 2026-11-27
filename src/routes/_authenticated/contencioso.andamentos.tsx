import { createFileRoute } from '@tanstack/react-router';
import type { SearchSchemaInput } from '@tanstack/react-router';
import { filtrosContencioso } from '@/lib/contencioso';
import type { FiltrosContencioso } from '@/lib/contencioso';
import { contenciosoQuery } from '@/lib/contencioso-query';
import { ContenciosoPage, ContenciosoError } from '@/components/office/contencioso';
import { paginaClasse } from '@/components/office/shared';
export const Route = createFileRoute('/_authenticated/contencioso/andamentos')({
  validateSearch: (s: Partial<FiltrosContencioso> & SearchSchemaInput) => filtrosContencioso.parse(s), loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(contenciosoQuery(deps, 'andamentos')),
  head: () => ({ meta: [{ title: 'Andamentos processuais — Manager ADV' }, { name: 'description', content: 'Movimentações reais de todos os processos vinculados à carteira CS Lawyers.' }, { property: 'og:title', content: 'Andamentos processuais — Manager ADV' }, { property: 'og:description', content: 'Pesquisa de movimentações por cliente, processo, tribunal e período.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: () => <ContenciosoPage filtros={Route.useSearch()} modo="andamentos"/>,
  errorComponent: ContenciosoError, notFoundComponent: () => <p className={`${paginaClasse} text-sm text-muted-foreground`}>Andamentos não encontrados.</p>,
});