/**
 * Frases fixas da camada operacional que não estão na biblioteca oficial, mas já eram aprovadas no fluxo da Anne
 * (copiadas sem alteração de ana.server.ts). Nada aqui passa pelo modelo nem é editável pela tela: textos novos só
 * pela biblioteca oficial (biblioteca/mensagens-oficiais.ts). Campo ausente impede o envio.
 * Os textos provisórios desta camada (nao_pode_comparecer, reagendamento_*…) foram removidos em 26/11/2026: o
 * reagendamento usa o modelo oficial 06 ou as frases aprovadas do agendamento (secretaria/reagendamento.ts).
 */
export const TEMPLATES_PADRAO = {
  presenca_confirmada: 'Presença confirmada! Sua consulta continua hoje, às {hora}.',
} as const;

export type ChaveTemplate = keyof typeof TEMPLATES_PADRAO;

export const CHAVES_TEMPLATE = Object.keys(TEMPLATES_PADRAO) as ChaveTemplate[];

export const DESCRICAO_TEMPLATE: Record<ChaveTemplate, string> = {
  presenca_confirmada: 'Cliente confirmou presença (confirmação ou lembrete).',
};

function campos(texto: string) {
  return [...new Set([...texto.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1] ?? ''))];
}

/** Campos exigidos por cada frase. */
export function camposTemplate(chave: ChaveTemplate) {
  return campos(TEMPLATES_PADRAO[chave]);
}

/** Texto usado: sempre o aprovado. `overrides` fica só por compatibilidade com configurações antigas e é ignorado se mudar campos. */
export function baseTemplate(chave: ChaveTemplate, overrides?: Partial<Record<string, string>>) {
  const proprio = overrides?.[chave]?.trim();
  if (!proprio) return TEMPLATES_PADRAO[chave];
  const permitidos = camposTemplate(chave);
  return campos(proprio).every(c => permitidos.includes(c)) ? proprio : TEMPLATES_PADRAO[chave];
}

export type TextoTemplate = { ok: true; texto: string } | { ok: false; faltando: string[] };

/** Preenche a frase; qualquer campo vazio impede o envio (nunca improvisa um valor). */
export function textoTemplate(chave: ChaveTemplate, dados: Partial<Record<string, string | undefined>> = {}, overrides?: Partial<Record<string, string>>): TextoTemplate {
  const base = baseTemplate(chave, overrides);
  const faltando = campos(base).filter(c => !dados[c]?.trim());
  if (faltando.length) return { ok: false, faltando };
  return { ok: true, texto: base.replace(/\{([a-z_]+)\}/g, (_, c: string) => dados[c]?.trim() ?? '') };
}
