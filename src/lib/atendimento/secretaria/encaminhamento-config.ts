/**
 * Configuração central do encaminhamento de clientes ativos ao advogado responsável (Fernando, advogado júnior da
 * Dra. Carolina): quem recebe, o WhatsApp do relatório e os horários de envio. Gravada dentro da configuração da
 * secretaria (`office_workspace.dados.secretaria.encaminhamento`), só por sênior/admin, pelo servidor.
 * Módulo sem dependências para ser lido pela tela, pelo servidor e pelos testes.
 */
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface ConfigEncaminhamento {
  /** Anne envia a mensagem fixa e registra a pendência para clientes ativos. */
  ativo: boolean;
  /** Nome do advogado responsável (aparece na pendência e no relatório). */
  responsavel: string;
  /** WhatsApp do responsável, só dígitos com 55 + DDD + celular. Inválido = relatório não sai (nunca outro número). */
  whatsapp: string | null;
  /** Relatório consolidado no WhatsApp do responsável. */
  relatorioAtivo: boolean;
  /** Horários do relatório (America/Sao_Paulo), "HH:MM". */
  horarios: string[];
}

/**
 * Expediente do escritório para mensagens ao advogado (pedido de 26/11/2026): só de segunda a sexta, das 09:00 às
 * 17:30 (America/Sao_Paulo). Horário de relatório fora disso nunca é aceito.
 */
export const EXPEDIENTE_RELATORIO = { inicio: '09:00', fim: '17:30' } as const;
/** "HH:MM" válido e dentro do expediente (início incluso, fim excluso). */
export function horarioNoExpediente(h: string): boolean {
  return HHMM.test(h) && h >= EXPEDIENTE_RELATORIO.inicio && h < EXPEDIENTE_RELATORIO.fim;
}

export const RESPONSAVEL_ENCAMINHAMENTO_PADRAO = 'Fernando';
export const WHATSAPP_ENCAMINHAMENTO_PADRAO = '5511991737442';
export const HORARIOS_RELATORIO_PADRAO = ['09:00', '16:00'];

export const CONFIG_ENCAMINHAMENTO_PADRAO: ConfigEncaminhamento = {
  ativo: true,
  responsavel: RESPONSAVEL_ENCAMINHAMENTO_PADRAO,
  whatsapp: WHATSAPP_ENCAMINHAMENTO_PADRAO,
  relatorioAtivo: true,
  horarios: HORARIOS_RELATORIO_PADRAO,
};

/** Celular brasileiro completo: 55 + DDD (2) + 9 + 8 dígitos. Fixo, grupo ou número curto nunca recebe o relatório. */
export function whatsappResponsavelValido(valor: unknown): string | null {
  const d = typeof valor === 'string' ? valor.replace(/\D/g, '') : '';
  return /^55[1-9]\d9\d{8}$/.test(d) ? d : null;
}

/** Lê sem confiar no conteúdo: campo ausente volta ao padrão; número inválido desliga o envio (não troca de destino). */
export function lerConfigEncaminhamento(salvo: unknown): ConfigEncaminhamento {
  const s = (salvo && typeof salvo === 'object' ? salvo : {}) as Record<string, unknown>;
  const nome = typeof s['responsavel'] === 'string' ? s['responsavel'].trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  const horarios = Array.isArray(s['horarios'])
    ? [...new Set(s['horarios'].filter((h): h is string => typeof h === 'string' && horarioNoExpediente(h)))].sort().slice(0, 4)
    : [];
  return {
    ativo: s['ativo'] !== false,
    responsavel: /^[\p{L}][\p{L} .'-]{1,59}$/u.test(nome) ? nome : RESPONSAVEL_ENCAMINHAMENTO_PADRAO,
    whatsapp: 'whatsapp' in s ? whatsappResponsavelValido(s['whatsapp']) : WHATSAPP_ENCAMINHAMENTO_PADRAO,
    relatorioAtivo: s['relatorioAtivo'] !== false,
    horarios: horarios.length ? horarios : HORARIOS_RELATORIO_PADRAO,
  };
}
