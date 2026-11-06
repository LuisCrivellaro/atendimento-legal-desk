import { createFileRoute } from '@tanstack/react-router';
import { filtrosContencioso } from '@/lib/contencioso';
import { contenciosoQuery } from '@/lib/contencioso-query';
import { ContenciosoPage, ContenciosoError } from '@/components/office/contencioso';
export const Route = createFileRoute('/_authenticated/contencioso/processos_/$codigo')({
  validateSearch: (s) => filtrosContencioso.parse(s), loaderDeps: ({ search }) => search,
  loader: ({ context, deps, params }) => context.queryClient.ensureQueryData(contenciosoQuery(deps, 'ficha', Number(params.codigo))),
  head: ({ params }) => ({ meta: [{ title: `Linha do tempo do processo ${params.codigo} — CS Lawyers` }, { name: 'description', content: 'Dados processuais e histórico original disponível pela API ProJuris.' }, { property: 'og:title', content: 'Linha do tempo processual — CS Lawyers' }, { property: 'og:description', content: 'Histórico original, vinculação ao cliente e sincronização individual.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: () => <ContenciosoPage filtros={Route.useSearch()} codigo={Number(Route.useParams().codigo)} modo="ficha"/>,
  errorComponent: ContenciosoError, notFoundComponent: () => <p className="p-8">Processo não encontrado.</p>,
});