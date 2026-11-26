/**
 * Secretaria digital (Anne em duas camadas): configuração da administração.
 *
 * Vive na raiz da área de trabalho do dono (`office_workspace.dados.secretaria`), sem migração, e só é gravada
 * pelo servidor (`salvarConfigSecretaria`, sênior/admin). O modelo nunca lê nem escreve esta configuração.
 * Desligada por padrão: com `ativa: false` todo o atendimento segue exatamente o fluxo anterior.
 */

/** Funcionalidades controladas pela matriz de permissões. */
export type Funcionalidade =
  | 'resposta_conversacional'
  | 'resposta_automacao'
  | 'sugestao_interna'
  | 'confirmacao_consulta'
  | 'lembrete_consulta'
  | 'reagendamento'
  | 'cancelamento'
  | 'andamento_processual'
  | 'solicitacao_documentos'
  | 'lembrete_coleta'
  | 'followup'
  | 'mensagem_programada';

/** automatico: a Anne executa sozinha; aprovacao: vira texto pronto para a equipe; desligado: nada acontece. */
export type NivelPermissao = 'automatico' | 'aprovacao' | 'desligado';

export type MatrizPermissoes = Record<Funcionalidade, NivelPermissao>;

export type Camada = 'conversacional' | 'operacional' | 'interna';

export const FUNCIONALIDADES: Record<Funcionalidade, { titulo: string; descricao: string; camada: Camada; /** Nível máximo permitido (gates jurídicos que a configuração não pode afrouxar). */ maximo: NivelPermissao }> = {
  resposta_conversacional: { titulo: 'Atendimento conversacional', descricao: 'Atendimento inicial, qualificação, dúvidas autorizadas e coleta de dados (só no modo Automático).', camada: 'conversacional', maximo: 'automatico' },
  resposta_automacao: { titulo: 'Responder dentro de uma automação', descricao: 'Respostas curtas do cliente a uma automação ativa (ex.: "ok" na confirmação).', camada: 'operacional', maximo: 'automatico' },
  sugestao_interna: { titulo: 'Sugestões internas', descricao: 'Textos sugeridos para a equipe revisar; nunca saem sozinhos.', camada: 'interna', maximo: 'automatico' },
  confirmacao_consulta: { titulo: 'Confirmação 40 min antes', descricao: 'Texto oficial da confirmação da consulta do dia.', camada: 'operacional', maximo: 'automatico' },
  lembrete_consulta: { titulo: 'Lembrete das 08:00', descricao: 'Lembrete do dia da consulta com SIM/NÃO.', camada: 'operacional', maximo: 'automatico' },
  reagendamento: { titulo: 'Reagendamento', descricao: 'Oferece horários verificados, confirma a escolha e só comunica sucesso com o recibo da agenda.', camada: 'operacional', maximo: 'automatico' },
  cancelamento: { titulo: 'Cancelamento autorizado', descricao: 'Cancela só com pedido explícito, confirmação posterior e recibo.', camada: 'operacional', maximo: 'automatico' },
  // A notícia processual continua exigindo a aprovação da revisora (regra do AGENTS.md): o máximo é "aprovacao".
  andamento_processual: { titulo: 'Andamentos processuais', descricao: 'Notícias objetivas e verificadas; sempre passam pela aprovação humana.', camada: 'operacional', maximo: 'aprovacao' },
  solicitacao_documentos: { titulo: 'Solicitação de documentos', descricao: 'Pede os itens faltantes do checklist real.', camada: 'operacional', maximo: 'automatico' },
  lembrete_coleta: { titulo: 'Lembretes de coleta', descricao: 'Lembretes do contrato e dos documentos faltantes.', camada: 'operacional', maximo: 'automatico' },
  followup: { titulo: 'Follow-up comercial', descricao: 'Retomada de oferta de horários sem resposta.', camada: 'operacional', maximo: 'automatico' },
  mensagem_programada: { titulo: 'Mensagens programadas', descricao: 'Mensagens agendadas pela equipe; revalidadas antes de sair.', camada: 'operacional', maximo: 'automatico' },
};

/**
 * Padrões conservadores: reproduzem o que já estava validado em produção e deixam desligado o que não estava
 * (vendedor desligado; mensagens programadas novas desligadas; andamentos sempre com aprovação).
 */
export const PERMISSOES_PADRAO: MatrizPermissoes = {
  resposta_conversacional: 'automatico',
  resposta_automacao: 'automatico',
  sugestao_interna: 'automatico',
  confirmacao_consulta: 'automatico',
  lembrete_consulta: 'automatico',
  reagendamento: 'automatico',
  cancelamento: 'aprovacao',
  andamento_processual: 'aprovacao',
  solicitacao_documentos: 'automatico',
  lembrete_coleta: 'automatico',
  followup: 'desligado',
  mensagem_programada: 'desligado',
};

export interface JanelaAutomacoes {
  /** "HH:MM" em São Paulo. */
  inicio: string;
  fim: string;
  /** Só de segunda a sexta. */
  diasUteis: boolean;
}

export interface ConfigSecretaria {
  /** Feature flag da secretaria digital. Padrão: desligada. */
  ativa: boolean;
  permissoes: MatrizPermissoes;
  /** Minutos depois de uma mensagem da equipe em que automações não urgentes ficam adiadas. */
  janelaPrioridadeHumanaMin: number;
  /** Volta do Híbrido (assumido pela equipe) para Automático sem mensagem da equipe por N horas. null = nunca (padrão). */
  retornoAutomaticoHoras: number | null;
  /** Horário das automações não urgentes (follow-ups, coleta, programadas). Confirmação e lembrete têm horário próprio. */
  janelaAutomacoes: JanelaAutomacoes;
  /** Textos dos modelos fixos (ver templates.ts); campos desconhecidos fazem voltar ao texto padrão. */
  templates: Partial<Record<string, string>>;
  atualizadoEm?: string | undefined;
  atualizadoPor?: string | undefined;
}

export const CONFIG_SECRETARIA_PADRAO: ConfigSecretaria = {
  ativa: false,
  permissoes: PERMISSOES_PADRAO,
  janelaPrioridadeHumanaMin: 30,
  retornoAutomaticoHoras: null,
  janelaAutomacoes: { inicio: '09:00', fim: '18:00', diasUteis: true },
  templates: {},
};

const NIVEIS: NivelPermissao[] = ['automatico', 'aprovacao', 'desligado'];
const ORDEM_NIVEL: Record<NivelPermissao, number> = { automatico: 0, aprovacao: 1, desligado: 2 };
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Nunca acima do máximo da funcionalidade (ex.: andamento processual nunca vira automático). */
export function limitarNivel(f: Funcionalidade, nivel: NivelPermissao): NivelPermissao {
  const maximo = FUNCIONALIDADES[f].maximo;
  return ORDEM_NIVEL[nivel] < ORDEM_NIVEL[maximo] ? maximo : nivel;
}

function inteiro(v: unknown, min: number, max: number, padrao: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao;
}

/**
 * Lê a configuração salva sem confiar no conteúdo: campo inválido volta ao padrão, nada lança erro.
 * `ativa` só é verdadeiro com o booleano `true` gravado.
 */
export function lerConfigSecretaria(salvo: unknown): ConfigSecretaria {
  const s = (salvo && typeof salvo === 'object' ? salvo : {}) as Record<string, unknown>;
  const p = (s['permissoes'] && typeof s['permissoes'] === 'object' ? s['permissoes'] : {}) as Record<string, unknown>;
  const permissoes = Object.fromEntries((Object.keys(PERMISSOES_PADRAO) as Funcionalidade[]).map(f => {
    const v = p[f];
    const nivel = typeof v === 'string' && (NIVEIS as string[]).includes(v) ? v as NivelPermissao : PERMISSOES_PADRAO[f];
    return [f, limitarNivel(f, nivel)];
  })) as MatrizPermissoes;
  const j = (s['janelaAutomacoes'] && typeof s['janelaAutomacoes'] === 'object' ? s['janelaAutomacoes'] : {}) as Record<string, unknown>;
  const inicio = typeof j['inicio'] === 'string' && HHMM.test(j['inicio']) ? j['inicio'] : CONFIG_SECRETARIA_PADRAO.janelaAutomacoes.inicio;
  const fim = typeof j['fim'] === 'string' && HHMM.test(j['fim']) && j['fim'] > inicio ? j['fim'] : CONFIG_SECRETARIA_PADRAO.janelaAutomacoes.fim;
  const retorno = s['retornoAutomaticoHoras'];
  const t = (s['templates'] && typeof s['templates'] === 'object' ? s['templates'] : {}) as Record<string, unknown>;
  const templates = Object.fromEntries(Object.entries(t).filter(([k, v]) => /^[a-z_]{1,40}$/.test(k) && typeof v === 'string' && v.trim().length > 0 && v.length <= 1000)) as Record<string, string>;
  return {
    ativa: s['ativa'] === true,
    permissoes,
    janelaPrioridadeHumanaMin: inteiro(s['janelaPrioridadeHumanaMin'], 0, 24 * 60, CONFIG_SECRETARIA_PADRAO.janelaPrioridadeHumanaMin),
    retornoAutomaticoHoras: retorno === null || retorno === undefined ? null : inteiro(retorno, 1, 24 * 30, 24),
    janelaAutomacoes: { inicio, fim, diasUteis: j['diasUteis'] !== false },
    templates,
    ...(typeof s['atualizadoEm'] === 'string' ? { atualizadoEm: s['atualizadoEm'] } : {}),
    ...(typeof s['atualizadoPor'] === 'string' ? { atualizadoPor: s['atualizadoPor'].slice(0, 80) } : {}),
  };
}

/**
 * Chave mestra do servidor: `ANNE_SECRETARIA_DESLIGADA=1` desliga tudo, mesmo com a flag da área de trabalho ligada.
 * Recebe o valor (não lê `process.env`) para continuar puro e testável.
 */
export function secretariaAtiva(config: ConfigSecretaria, chaveMestra?: string | undefined) {
  return config.ativa && chaveMestra !== '1' && chaveMestra !== 'true';
}

export function nivelPermissao(config: ConfigSecretaria, f: Funcionalidade): NivelPermissao {
  return limitarNivel(f, config.permissoes[f] ?? PERMISSOES_PADRAO[f]);
}
