import { z } from 'zod';
import { PERMISSOES_PADRAO, type Funcionalidade } from './config';
import { CHAVES_TEMPLATE } from './templates';

/**
 * Validação da configuração enviada pela tela (sênior/admin) antes de gravar.
 * Os modelos de mensagem são opcionais: só vêm os que a administração escreveu (em branco = texto padrão).
 * Zod 4: `z.record` com chave enum exige todas as chaves; por isso `z.partialRecord`.
 */
const NIVEL = z.enum(['automatico', 'aprovacao', 'desligado']);
const HHMM = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const esquemaConfigSecretaria = z.object({
  ativa: z.boolean(),
  permissoes: z.object(Object.fromEntries((Object.keys(PERMISSOES_PADRAO) as Funcionalidade[]).map(f => [f, NIVEL])) as Record<Funcionalidade, typeof NIVEL>),
  janelaPrioridadeHumanaMin: z.number().int().min(0).max(1440),
  retornoAutomaticoHoras: z.number().int().min(1).max(720).nullable(),
  janelaAutomacoes: z.object({ inicio: HHMM, fim: HHMM, diasUteis: z.boolean() }),
  templates: z.partialRecord(z.enum(CHAVES_TEMPLATE as [string, ...string[]]), z.string().max(1000)),
});

export type EntradaConfigSecretaria = z.infer<typeof esquemaConfigSecretaria>;
