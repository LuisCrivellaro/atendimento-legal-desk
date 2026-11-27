import { z } from 'zod';
import { CHAVES_TEXTO_APROVADO, PERMISSOES_PADRAO, type Funcionalidade } from './config';
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
  templates: z.partialRecord(z.enum(CHAVES_TEMPLATE as [string, ...string[]]), z.string().max(1000)).optional(),
  confirmacaoAntecedenciaMin: z.number().int().min(30).max(1440).optional(),
  testeAutomacoes: z.object({ ativo: z.boolean(), numero: z.string().max(20).nullable() }).optional(),
  /** Aprovação dos textos que não são da biblioteca oficial (lembretes de coleta): vale para o texto exato aprovado. */
  eventos: z.object({ diasLembreteAudiencia: z.number().int().min(1).max(7), diasConfirmacaoEvento: z.number().int().min(1).max(15).nullable(), antecedenciaAudiencia: z.string().max(60).nullable() }).optional(),
  aprovacoesTexto: z.partialRecord(z.enum(CHAVES_TEXTO_APROVADO), z.object({ texto: z.string().min(1).max(2000) })).optional(),
  /** Encaminhamento ao advogado responsável: só celular brasileiro completo (55 + DDD + 9 dígitos) recebe o relatório. */
  encaminhamento: z.object({
    ativo: z.boolean(),
    responsavel: z.string().min(2).max(60),
    whatsapp: z.string().regex(/^55[1-9]\d9\d{8}$/, 'WhatsApp do responsável: use 55 + DDD + celular (só números).'),
    relatorioAtivo: z.boolean(),
    horarios: z.array(HHMM).min(1).max(4),
  }).optional(),
});

export type EntradaConfigSecretaria = z.infer<typeof esquemaConfigSecretaria>;
