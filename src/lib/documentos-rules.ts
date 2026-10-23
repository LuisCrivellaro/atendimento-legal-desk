import { z } from 'zod';
import type { DocItem } from './mock-data';

export const resultadoSchema = z.object({
  tipoDocumento: z.string(), itemChecklist: z.string().nullable(),
  confianca: z.enum(['alta', 'media', 'baixa']), nomeTitular: z.string().nullable(), cpf: z.string().nullable(),
  datas: z.array(z.object({ descricao: z.string(), data: z.string() })),
  detalhesCaso: z.array(z.string()), observacoes: z.string().nullable(),
});
export type ResultadoAnalise = z.infer<typeof resultadoSchema>;
export function itemIdentificado(resultado: ResultadoAnalise, documentos: DocItem[]) {
  if (resultado.confianca !== 'alta' || !resultado.itemChecklist) return undefined;
  return documentos.find(d => d.nome === resultado.itemChecklist);
}