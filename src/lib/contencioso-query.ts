import { queryOptions } from '@tanstack/react-query';
import { consultarContencioso } from './contencioso.functions';
import type { FiltrosContencioso } from './contencioso';
export const contenciosoQuery = (filtros: FiltrosContencioso, modo: 'processos' | 'andamentos' | 'ficha', codigo?: number) => queryOptions({
  queryKey: ['contencioso', modo, codigo, filtros], queryFn: () => consultarContencioso({ data: { ...filtros, modo, codigo } }), staleTime: 30_000, retry: false,
});