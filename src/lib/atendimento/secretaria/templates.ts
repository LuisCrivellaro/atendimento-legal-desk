/**
 * Modelos fixos das comunicações previsíveis da camada operacional. Nada aqui passa pelo modelo:
 * os campos só são preenchidos com dados verificados e, se faltar algum, a mensagem não sai (vai para a equipe).
 * A administração pode trocar o texto (config.templates), mas só com os mesmos campos; texto com campo
 * desconhecido é ignorado e o padrão continua valendo.
 */
export const TEMPLATES_PADRAO = {
  presenca_confirmada: 'Presença confirmada! Sua consulta continua hoje, às {hora}.',
  nao_pode_comparecer: 'Obrigada por avisar. Passei para a equipe, que vai falar com você por aqui sobre remarcar ou cancelar. Por enquanto nada foi cancelado.',
  reagendamento_opcoes: 'Para remarcar a sua consulta de {consulta}, estas são as opções livres:\n\n{opcoes}\n\nQual fica melhor para você?',
  reagendamento_repetir: 'Qual das opções enviadas fica melhor para você? Pode responder com o dia e o horário.',
  reagendamento_confirmar: 'Posso remarcar a sua consulta para {novo}? Responda SIM para confirmar.',
  reagendamento_indisponivel: 'Esse horário não está disponível.',
  reagendamento_sucesso: 'Pronto! Sua consulta foi remarcada para {novo}.',
  reagendamento_mantida: 'Combinado, sua consulta continua marcada para {consulta}.',
  reagendamento_falha: 'Não consegui concluir a remarcação agora. A equipe vai conferir e falar com você por aqui; não considere a mudança confirmada por esta mensagem.',
  reagendamento_sem_opcoes: 'Não encontrei horários livres verificados agora. A equipe vai falar com você por aqui para combinar.',
  encaminhado_equipe: 'Obrigada! Passei para a equipe, que te responde por aqui.',
} as const;

export type ChaveTemplate = keyof typeof TEMPLATES_PADRAO;

export const CHAVES_TEMPLATE = Object.keys(TEMPLATES_PADRAO) as ChaveTemplate[];

export const DESCRICAO_TEMPLATE: Record<ChaveTemplate, string> = {
  presenca_confirmada: 'Cliente confirmou presença (confirmação ou lembrete).',
  nao_pode_comparecer: 'Cliente avisou que não vai conseguir (nada é cancelado).',
  reagendamento_opcoes: 'Opções livres verificadas para remarcar.',
  reagendamento_repetir: 'Pedido para escolher uma das opções.',
  reagendamento_confirmar: 'Confirmação explícita do novo horário.',
  reagendamento_indisponivel: 'Horário pedido não está livre.',
  reagendamento_sucesso: 'Remarcação concluída (só com recibo da agenda).',
  reagendamento_mantida: 'Cliente decidiu manter a consulta.',
  reagendamento_falha: 'Falha na remarcação (nunca confirma a mudança).',
  reagendamento_sem_opcoes: 'Sem horários livres verificados.',
  encaminhado_equipe: 'Resposta passada à equipe.',
};

function campos(texto: string) {
  return [...new Set([...texto.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1] ?? ''))];
}

/** Campos exigidos por cada modelo (os do texto padrão). */
export function camposTemplate(chave: ChaveTemplate) {
  return campos(TEMPLATES_PADRAO[chave]);
}

/** Texto escolhido: o da administração se usar só campos permitidos; senão, o padrão. */
export function baseTemplate(chave: ChaveTemplate, overrides?: Partial<Record<string, string>>) {
  const proprio = overrides?.[chave]?.trim();
  if (!proprio) return TEMPLATES_PADRAO[chave];
  const permitidos = camposTemplate(chave);
  return campos(proprio).every(c => permitidos.includes(c)) ? proprio : TEMPLATES_PADRAO[chave];
}

export type TextoTemplate = { ok: true; texto: string } | { ok: false; faltando: string[] };

/** Preenche o modelo; qualquer campo vazio impede o envio (nunca improvisa um valor). */
export function textoTemplate(chave: ChaveTemplate, dados: Partial<Record<string, string | undefined>> = {}, overrides?: Partial<Record<string, string>>): TextoTemplate {
  const base = baseTemplate(chave, overrides);
  const faltando = campos(base).filter(c => !dados[c]?.trim());
  if (faltando.length) return { ok: false, faltando };
  return { ok: true, texto: base.replace(/\{([a-z_]+)\}/g, (_, c: string) => dados[c]?.trim() ?? '') };
}
