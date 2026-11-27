/**
 * Instruções operacionais da equipe para a Anne (Treinamento de IA → Orientações → "Avisos e instruções
 * operacionais"), pedido de 27/11/2026. Puro e testado.
 *
 * - A equipe escreve em linguagem natural; a interpretação determinística (expressões de tempo em português,
 *   America/Sao_Paulo) vira datas absolutas e regras estruturadas validadas pelo servidor. A IA só ajuda quando a
 *   equipe pede, e o resultado dela passa pela mesma validação.
 * - Restrição operacional é aplicada no backend (agenda, reservas, automações); orientação comportamental vai para o
 *   contexto da Anne. Instrução nunca amplia permissão: só restringe ou orienta dentro das competências da Anne.
 * - Validade calculada a cada leitura (início/fim absolutos): expira sozinha, sem rotina periódica; o histórico fica.
 * Hierarquia: segurança/privacidade/permissões e restrições jurídicas > regras fundamentais e bloqueios do sistema >
 * instruções operacionais ativas > regras gerais de atendimento > interpretação conversacional da Anne.
 */

// ---------- Catálogos (ampliáveis: categoria desconhecida é preservada e exibida como veio) ----------
export const CATEGORIAS_INSTRUCAO: Record<string, string> = {
  disponibilidade_agenda: 'Disponibilidade da agenda', agendamentos: 'Agendamentos', reagendamentos: 'Reagendamentos', cancelamentos: 'Cancelamentos',
  atendimento_inicial: 'Atendimento inicial', clientes_ativos: 'Clientes ativos', encaminhamento_humano: 'Encaminhamento humano',
  coleta_documentos: 'Coleta de documentos', lembretes: 'Lembretes', confirmacoes: 'Confirmações', audiencias_pericias: 'Audiências e perícias',
  automacoes: 'Automações', comunicacao: 'Comunicação', regras_comerciais: 'Regras comerciais', orientacoes_gerais: 'Orientações gerais',
};
export const AUTOMACOES_SUSPENSIVEIS = {
  lembretes: 'Lembretes de consulta', confirmacoes: 'Confirmações de presença', reagendamento_automatico: 'Reagendamento automático',
  coleta: 'Lembretes de coleta de documentos', vendedor: 'Lembrete a novos leads (vendedor)', eventos_processuais: 'Lembretes de audiências e perícias',
  relatorio_advogado: 'Relatório de pendências do advogado', encaminhamento_advogado: 'Encaminhamento de clientes ativos ao advogado',
} as const;
export type AutomacaoSuspensivel = keyof typeof AUTOMACOES_SUSPENSIVEIS;
export type PrioridadeInstrucao = 'baixa' | 'normal' | 'alta' | 'critica';
export const ROTULO_PRIORIDADE: Record<PrioridadeInstrucao, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica' };

export type RegraOperacional =
  /** Horários de consulta que se sobrepõem a este intervalo não são oferecidos nem reservados pela Anne. */
  | { tipo: 'bloquear_periodo_agenda'; inicio: string; fim: string }
  /** Nenhum novo agendamento pela Anne enquanto a instrução vale (qualquer horário). */
  | { tipo: 'suspender_agendamentos' }
  /** Sem oferta de consulta nem agendamento para novos leads enquanto vale. */
  | { tipo: 'suspender_captacao' }
  | { tipo: 'suspender_automacao'; automacao: AutomacaoSuspensivel }
  /** Só orientação no contexto da Anne (sem bloqueio automático). */
  | { tipo: 'comportamental' };

export interface InstrucaoOperacional {
  id: string;
  titulo: string;
  texto: string;
  categoria: string;
  prioridade: PrioridadeInstrucao;
  tipo: 'temporaria' | 'permanente';
  inicio: string;
  /** Fim absoluto; null = até ser desativada ("até segunda ordem"/permanente). */
  fim: string | null;
  status: 'ativa' | 'desativada';
  regras: RegraOperacional[];
  /** Resumo da interpretação confirmado pela equipe na ativação. */
  interpretacao: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoPor?: string | undefined;
  atualizadoEm?: string | undefined;
  desativadoPor?: string | undefined;
  desativadoEm?: string | undefined;
  versao: number;
  historico: { em: string; por: string; acao: string }[];
}
export type SituacaoInstrucao = 'programada' | 'ativa' | 'expirada' | 'desativada';
export const ROTULO_SITUACAO: Record<SituacaoInstrucao, string> = { programada: 'Programada', ativa: 'Ativa', expirada: 'Expirada', desativada: 'Desativada' };

// ---------- Validade (sempre calculada na hora: sem rotina periódica) ----------
export function situacaoInstrucao(i: Pick<InstrucaoOperacional, 'status' | 'inicio' | 'fim'>, agora = new Date()): SituacaoInstrucao {
  if (i.status === 'desativada') return 'desativada';
  const t = agora.getTime();
  if (i.fim && t >= Date.parse(i.fim)) return 'expirada';
  if (t < Date.parse(i.inicio)) return 'programada';
  return 'ativa';
}
const AUTOMACOES = Object.keys(AUTOMACOES_SUSPENSIVEIS) as AutomacaoSuspensivel[];
const ISO = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
function regraValida(r: unknown): RegraOperacional | undefined {
  const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
  if (x['tipo'] === 'bloquear_periodo_agenda' && ISO(x['inicio']) && ISO(x['fim']) && Date.parse(x['fim']) > Date.parse(x['inicio'])) return { tipo: 'bloquear_periodo_agenda', inicio: new Date(x['inicio']).toISOString(), fim: new Date(x['fim']).toISOString() };
  if (x['tipo'] === 'suspender_agendamentos' || x['tipo'] === 'suspender_captacao' || x['tipo'] === 'comportamental') return { tipo: x['tipo'] };
  if (x['tipo'] === 'suspender_automacao' && AUTOMACOES.includes(x['automacao'] as AutomacaoSuspensivel)) return { tipo: 'suspender_automacao', automacao: x['automacao'] as AutomacaoSuspensivel };
  return undefined;
}
/** Lê sem confiar no conteúdo (gravado só pelo servidor, mas nunca derruba a Anne): item inválido é ignorado. */
export function lerInstrucoes(state: unknown): InstrucaoOperacional[] {
  const lista = (state && typeof state === 'object' ? (state as { instrucoesOperacionais?: unknown }).instrucoesOperacionais : undefined);
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((v): InstrucaoOperacional[] => {
    const i = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    if (typeof i['id'] !== 'string' || typeof i['texto'] !== 'string' || !ISO(i['inicio']) || !(i['fim'] === null || ISO(i['fim']))) return [];
    const regras = (Array.isArray(i['regras']) ? i['regras'] : []).map(regraValida).filter((r): r is RegraOperacional => !!r);
    return [{
      id: i['id'], titulo: typeof i['titulo'] === 'string' ? i['titulo'] : i['texto'].slice(0, 60), texto: i['texto'],
      categoria: typeof i['categoria'] === 'string' ? i['categoria'] : 'orientacoes_gerais',
      prioridade: (['baixa', 'normal', 'alta', 'critica'] as const).includes(i['prioridade'] as PrioridadeInstrucao) ? i['prioridade'] as PrioridadeInstrucao : 'normal',
      tipo: i['tipo'] === 'permanente' ? 'permanente' : 'temporaria', inicio: i['inicio'], fim: (i['fim'] as string | null),
      status: i['status'] === 'desativada' ? 'desativada' : 'ativa', regras: regras.length ? regras : [{ tipo: 'comportamental' }],
      interpretacao: typeof i['interpretacao'] === 'string' ? i['interpretacao'] : '', criadoPor: String(i['criadoPor'] ?? 'equipe'), criadoEm: ISO(i['criadoEm']) ? i['criadoEm'] : i['inicio'],
      ...(typeof i['atualizadoPor'] === 'string' ? { atualizadoPor: i['atualizadoPor'] } : {}), ...(ISO(i['atualizadoEm']) ? { atualizadoEm: i['atualizadoEm'] } : {}),
      ...(typeof i['desativadoPor'] === 'string' ? { desativadoPor: i['desativadoPor'] } : {}), ...(ISO(i['desativadoEm']) ? { desativadoEm: i['desativadoEm'] } : {}),
      versao: typeof i['versao'] === 'number' ? i['versao'] : 1, historico: Array.isArray(i['historico']) ? (i['historico'] as InstrucaoOperacional['historico']).slice(-50) : [],
    }];
  });
}
export function instrucoesVigentes(lista: InstrucaoOperacional[], agora = new Date()): InstrucaoOperacional[] {
  return lista.filter(i => situacaoInstrucao(i, agora) === 'ativa');
}
const regrasVigentes = (lista: InstrucaoOperacional[], agora: Date) => instrucoesVigentes(lista, agora).flatMap(i => i.regras.map(r => ({ r, i })));

/** Intervalos bloqueados pelas instruções vigentes (somados aos compromissos ocupados da agenda). */
export function bloqueiosAgenda(lista: InstrucaoOperacional[], agora = new Date()): { start: string; end: string }[] {
  return regrasVigentes(lista, agora).flatMap(({ r }) => (r.tipo === 'bloquear_periodo_agenda' && Date.parse(r.fim) > agora.getTime() ? [{ start: r.inicio, end: r.fim }] : []));
}
export function agendamentosSuspensos(lista: InstrucaoOperacional[], agora = new Date(), tipoCliente?: string): InstrucaoOperacional | undefined {
  return regrasVigentes(lista, agora).find(({ r }) => r.tipo === 'suspender_agendamentos' || r.tipo === 'suspender_captacao' && tipoCliente === 'novo')?.i;
}
export function captacaoSuspensa(lista: InstrucaoOperacional[], agora = new Date()): InstrucaoOperacional | undefined {
  return regrasVigentes(lista, agora).find(({ r }) => r.tipo === 'suspender_captacao')?.i;
}
/** Automação suspensa por instrução vigente (aceita a lista ou o estado da área de trabalho). */
export function automacaoSuspensa(origem: InstrucaoOperacional[] | unknown, automacao: AutomacaoSuspensivel, agora = new Date()): InstrucaoOperacional | undefined {
  const lista = Array.isArray(origem) ? origem as InstrucaoOperacional[] : lerInstrucoes(origem);
  return regrasVigentes(lista, agora).find(({ r }) => r.tipo === 'suspender_automacao' && r.automacao === automacao)?.i;
}
/** Revalidação antes de oferecer/confirmar um horário: bloqueio de período ou suspensão de agendamentos. */
export function horarioBloqueado(lista: InstrucaoOperacional[], inicio: string, agora = new Date(), tipoCliente?: string, duracaoMin = 30): InstrucaoOperacional | undefined {
  const suspensa = agendamentosSuspensos(lista, agora, tipoCliente);
  if (suspensa) return suspensa;
  const a = Date.parse(inicio), b = a + duracaoMin * 60000;
  return regrasVigentes(lista, agora).find(({ r }) => r.tipo === 'bloquear_periodo_agenda' && a < Date.parse(r.fim) && b > Date.parse(r.inicio))?.i;
}
/**
 * Ocupados da agenda somados aos bloqueios vigentes; suspensão de agendamentos (ou de captação, para cliente novo)
 * ocupa o horizonte inteiro — nenhuma oferta. `null` (agenda indisponível) continua `null`.
 */
export function aplicarInstrucoesAgenda(busy: { start: string; end: string }[] | null, lista: InstrucaoOperacional[], agora = new Date(), dias = 30, tipoCliente?: string): { start: string; end: string }[] | null {
  if (!busy) return null;
  // Ocupa bem além de qualquer horizonte de oferta (dias úteis, feriados): nenhum horário sai enquanto vale.
  if (agendamentosSuspensos(lista, agora, tipoCliente)) return [...busy, { start: agora.toISOString(), end: new Date(agora.getTime() + Math.max(dias + 1, 400) * 86400000).toISOString() }];
  return [...busy, ...bloqueiosAgenda(lista, agora)];
}
/** Erro da revalidação antes da reserva: o fluxo existente oferece novas opções conferidas. */
export const ERRO_HORARIO_BLOQUEADO = 'Esse horário não está mais disponível. Escolha outro horário.';
/** Texto fixo quando a agenda está suspensa por instrução (sem inventar data nem motivo). */
export const TEXTO_AGENDA_SUSPENSA = 'No momento não consigo marcar consultas por aqui. A equipe vai te retornar com uma data.';

/** Orientações vigentes para o contexto da Anne (prioridade mais alta primeiro); nunca acima das regras fixas. */
export function instrucoesParaContexto(lista: InstrucaoOperacional[], agora = new Date()): { prioridade: PrioridadeInstrucao; instrucao: string; valida_ate: string | null }[] {
  const ordem: Record<PrioridadeInstrucao, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };
  return instrucoesVigentes(lista, agora).sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade])
    .map(i => ({ prioridade: i.prioridade, instrucao: `${i.texto}${i.interpretacao ? ` (interpretação confirmada: ${i.interpretacao})` : ''}`.slice(0, 600), valida_ate: i.fim }));
}

// ---------- Fuso America/Sao_Paulo (sem horário de verão desde 2019: -03:00) ----------
const FUSO = 'America/Sao_Paulo';
const partes = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
const diaDe = (d: Date) => { const p = partes(d); return `${p['year']}-${p['month']}-${p['day']}`; };
const SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const diaSemana = (d: Date) => SEMANA.indexOf(partes(d)['weekday'] ?? 'Sun');
export const dataSP = (dia: string, hhmm = '00:00') => new Date(`${dia}T${hhmm}:00-03:00`);
const somarDias = (dia: string, n: number) => diaDe(new Date(dataSP(dia, '12:00').getTime() + n * 86400000));
const fmt = (d: Date) => { const p = partes(d); return `${p['day']}/${p['month']}/${p['year']} ${p['hour']}:${p['minute']}`; };
export const dataHoraSP = (iso: string | null) => (iso ? fmt(new Date(iso)) : 'até ser desativada');

// ---------- Interpretação determinística ----------
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12, quinze: 15, vinte: 20, trinta: 30 };
const numero = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMEROS[s] ?? NaN);
const DIAS_SEMANA: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const HORA = '(\\d{1,2})(?:(?:h|:)(\\d{2})?|\\s*horas?)';
const hhmm = (h: string | undefined, m: string | undefined) => `${String(Number(h ?? 0)).padStart(2, '0')}:${String(Number(m ?? 0)).padStart(2, '0')}`;

interface Tempo {
  /** Janela citada (para bloquear horários ou delimitar a validade). */
  janela?: { inicio: Date; fim: Date } | undefined;
  /** Início explícito ("a partir de amanhã"). */
  aPartir?: Date | undefined;
  /** Fim explícito ("até segunda-feira"). */
  ate?: Date | undefined;
  semFim: boolean;
  permanente: boolean;
  notas: string[];
}
/** Dia citado no texto: hoje, amanhã, depois de amanhã, dia da semana ou data dd/mm. */
function diaCitado(t: string, agora: Date): { dia: string; trecho: string } | undefined {
  const hoje = diaDe(agora);
  let m = /\bdepois de amanha\b/.exec(t); if (m) return { dia: somarDias(hoje, 2), trecho: m[0] };
  m = /\bamanha\b/.exec(t); if (m) return { dia: somarDias(hoje, 1), trecho: m[0] };
  m = /\bhoje\b/.exec(t); if (m) return { dia: hoje, trecho: m[0] };
  m = /\b(?:dia )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : partes(agora)['year'];
    let dia = `${ano}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    if (!m[3] && dataSP(dia, '23:59') < agora) dia = `${Number(ano) + 1}${dia.slice(4)}`;
    return Number.isFinite(dataSP(dia).getTime()) ? { dia, trecho: m[0] } : undefined;
  }
  m = /\b(proxim[ao] |nest[ae] |ness[ae] |na |no )?(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?\b/.exec(t);
  if (m) {
    const alvo = DIAS_SEMANA[m[2]!]!;
    let n = (alvo - diaSemana(agora) + 7) % 7;
    if (n === 0 && /proxim/.test(m[1] ?? '')) n = 7;
    return { dia: somarDias(hoje, n), trecho: m[0] };
  }
  return undefined;
}
function interpretarTempo(texto: string, agora: Date): Tempo {
  const r: Tempo = { semFim: false, permanente: false, notas: [] };
  if (/\b(?:ate segunda ordem|ate nova ordem|por tempo indeterminado|sem prazo)\b/.test(texto)) r.semFim = true;
  // "segunda ordem" não é segunda-feira.
  const t = texto.replace(/\bate (?:segunda|nova) ordem\b/g, ' ');
  const hoje = diaDe(agora);
  // "nas/durante as próximas 2 horas", "próximos 30 minutos"
  let m = /\bproxim[ao]s? (\d+|[a-z]+) (hora|horas|minuto|minutos)\b/.exec(t);
  if (m && Number.isFinite(numero(m[1]!))) {
    const ms = numero(m[1]!) * (m[2]!.startsWith('hora') ? 3600000 : 60000);
    r.janela = { inicio: agora, fim: new Date(agora.getTime() + ms) };
  }
  if (/\b(?:permanente(?:mente)?|sempre|de agora em diante|daqui para frente)\b/.test(t)) r.permanente = true;
  // Período entre datas/dias: "de 10/12 a 20/12", "entre segunda e quarta", "de sexta a segunda"
  m = /\b(?:de|entre) ((?:dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:proxim[ao] )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?|hoje|amanha) (?:a|ate|e) ((?:dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:proxim[ao] )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?|hoje|amanha)\b/.exec(t);
  if (m && !r.janela) {
    const a = diaCitado(m[1]!, agora), b = diaCitado(m[2]!, agora);
    if (a && b) {
      let fimDia = b.dia;
      if (dataSP(fimDia) < dataSP(a.dia)) fimDia = somarDias(fimDia, 7);
      r.janela = { inicio: dataSP(a.dia), fim: dataSP(somarDias(fimDia, 1)) };
    }
  }
  const dia = diaCitado(t.replace(/\bate (?:o fim d[ae] |a )?(?:amanha|hoje|(?:proxim[ao] )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?|(?:dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g, ' ').replace(/\ba partir d[eo] (?:amanha|hoje|(?:proxim[ao] )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?|(?:dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g, ' '), agora);
  // "das 14h às 17h" (no dia citado ou hoje)
  m = new RegExp(`\\bd[ae]s? ${HORA} (?:as|ate as|ate|a) ${HORA}`).exec(t);
  if (m && !r.janela) {
    const base = dia?.dia ?? hoje;
    r.janela = { inicio: dataSP(base, hhmm(m[1], m[2])), fim: dataSP(base, hhmm(m[3], m[4])) };
  }
  // "somente/apenas/só após as 14h" → bloqueia o dia até 14h; "somente antes das 10h" → bloqueia de 10h em diante
  m = new RegExp(`\\b(?:somente|apenas|so|exclusivamente) (?:apos|depois d[ae]s?|a partir d[ae]s?) (?:as )?${HORA}`).exec(t);
  if (m && !r.janela) { const base = dia?.dia ?? hoje; r.janela = { inicio: dataSP(base), fim: dataSP(base, hhmm(m[1], m[2])) }; r.notas.push(`Horários antes de ${hhmm(m[1], m[2])} em ${base.split('-').reverse().join('/')} ficam bloqueados.`); }
  m = new RegExp(`\\b(?:somente|apenas|so|exclusivamente) (?:antes d[ae]s?|ate as) ${HORA}`).exec(t);
  if (m && !r.janela) { const base = dia?.dia ?? hoje; r.janela = { inicio: dataSP(base, hhmm(m[1], m[2])), fim: dataSP(somarDias(base, 1)) }; }
  // Turnos: hoje à tarde / de manhã / à noite (no dia citado)
  if (!r.janela && /\b(?:a|de|pela) (?:tarde|manha|noite)\b/.test(t) && dia) {
    const turno = /\b(?:a|de|pela) tarde\b/.test(t) ? ['12:00', '18:00'] : /\b(?:a|de|pela) manha\b/.test(t) ? ['00:00', '12:00'] : ['18:00', '23:59'];
    r.janela = { inicio: dataSP(dia.dia, turno[0]), fim: dataSP(dia.dia, turno[1]) };
  }
  // Semana: "durante esta semana" → até segunda-feira 00:00
  if (!r.janela && /\b(?:esta|essa|nesta|nessa) semana\b/.test(t)) {
    const n = ((1 - diaSemana(agora) + 7) % 7) || 7;
    r.janela = { inicio: agora, fim: dataSP(somarDias(hoje, n)) };
  }
  // "a partir de ..." e "até ..."
  m = /\ba partir d[eo] (agora|amanha|hoje|(?:proxim[ao] )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?|(?:dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/.exec(t);
  if (m) r.aPartir = m[1] === 'agora' ? agora : (() => { const d = diaCitado(m![1]!, agora); return d ? dataSP(d.dia) : undefined; })();
  m = new RegExp(`\\bate (?:as )?${HORA}`).exec(t);
  if (m && !/\bd[ae]s? \d/.test(t)) r.ate = dataSP(dia?.dia ?? hoje, hhmm(m[1], m[2]));
  m = /\bate (?:o fim d[ae] |a )?(amanha|hoje|(?:proxim[ao] )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira| feira)?|(?:dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/.exec(t);
  if (m && !r.ate) {
    const d = diaCitado(m[1]!, agora);
    if (d) {
      const fimDoDia = /\bfim d[ae]\b/.test(m[0]) || m[1] === 'hoje';
      r.ate = dataSP(fimDoDia ? somarDias(d.dia, 1) : d.dia);
      if (!fimDoDia) r.notas.push(`"${m[0]}" entendido como até o início de ${d.dia.split('-').reverse().join('/')} (00:00). Se a instrução deve valer também nesse dia, ajuste o término.`);
    }
  }
  // Dia citado sozinho (sem janela): o dia inteiro ("na próxima sexta", "amanhã", "hoje")
  if (!r.janela && !r.ate && dia) {
    const inicioDia = dataSP(dia.dia);
    r.janela = { inicio: inicioDia < agora ? agora : inicioDia, fim: dataSP(somarDias(dia.dia, 1)) };
  }
  return r;
}

const SINAL_JANELA_AGENDA = /\b(?:para as proxim|dentro d|nao (?:vai |ira )?atend|nao atendera|ferias|folga|ausen|indisponivel|recesso|viagem|somente (?:apos|depois|antes|a partir)|apenas (?:apos|depois|antes|a partir)|so (?:apos|depois|antes|a partir)|bloque\w* (?:a )?agenda|fechar (?:a )?agenda|d[ae]s? \d{1,2}(?:h|:))/;
const VERBO_RESTRITIVO = /\b(?:nao|sem|nenhum\w*|suspend\w*|paus\w*|par(?:ar|e|em)|interromp\w*|desativ\w*|desligar|bloque\w*|evitar|proib\w*|deixar de)\b/;
const AGENDA = /\b(?:agend\w*|marcar|marcacao|consultas?|horarios?|atend(?:er|imento|era)|agenda)\b/;
/**
 * Sinal forte de agenda: verbo de agendar/marcar/oferecer horário ou a própria agenda. "Consulta", "horário" e
 * "atendimento" sozinhos aparecem em orientações de conversa ("não falar de valores de consultas") e não bastam.
 */
const AGENDA_FORTE = /\b(?:agend\w*|marca(?:r|cao)|ofere\w* (?:as |os )?(?:consultas?|horarios?)|bloque\w* (?:os |a )?(?:horarios?|agenda)|agenda|nenhum\w* (?:consulta|agendamento|horario)s?)\b/;
const SUSPENSAO_EXPLICITA = /\b(?:suspend\w*|paus\w*|parar|pare|interromp\w*)\b/;
const PROIBIDO: [RegExp, string][] = [
  [/\b(?:ignor|desconsider|esquec)\w* (?:as |todas as )?(?:regras|instrucoes|restricoes|seguranca)/, 'Instrução não pode desligar regras de segurança ou do sistema.'],
  [/^(?!.*\b(?:nao|nunca|sem)\b.{0,20}\b(?:agend|marcar|atender|oferecer)).*\b(?:agend\w*|marcar|atender|oferecer)\b.{0,40}\b(?:sabados?|domingos?|feriados?)\b/, 'Agendamentos em fim de semana ou feriado não podem ser liberados por instrução (regra fundamental da agenda).'],
  [/\b(?:passar|informar|enviar|divulgar|compartilhar)\w* .{0,40}\b(?:dados|processos?|informac\w*|cpf|telefone)\b.{0,30}\b(?:outr[oa]s?|terceir\w*|de qualquer)/, 'Instrução não pode autorizar divulgar dados de clientes ou processos.'],
  [/\b(?:alter|mud|reescrev|modific)\w* .{0,30}\b(?:mensage(?:m|ns) oficia\w*|modelos? oficia\w*|templates?|biblioteca)/, 'Mensagens oficiais só mudam pela biblioteca, com aprovação da Dra.'],
  [/^(?!.*\b(?:nao|nunca|sem)\b.{0,15}\bcancel).*\bcancel\w*\b.{0,40}\b(?:consultas?|compromissos?|agendamentos?)\b/, 'Instrução não cancela nem altera consultas já marcadas: a equipe faz isso pelo Atendimento.'],
  [/\b(?:prometer|garantir|assegurar)\b.{0,30}\b(?:resultado|ganho|vitoria|sucesso|valor)/, 'Promessa de resultado é proibida (ética da OAB).'],
  [/\b(?:responder|orientar|dar parecer|aconselhar|explicar)\b.{0,40}\b(?:juridic\w*|direitos?|prazos? (?:do|de) processo|estrategia)/, 'Orientação jurídica fica com a Dra./equipe; a Anne não pode dar parecer.'],
  [/\b(?:liberar|permitir|pode)\b.{0,30}\b(?:consulta inicial|primeira consulta|captacao)\b.{0,30}\bclientes? (?:ativos|cadastrados)/, 'Carteira de agenda (novo/cadastrado) é regra do sistema.'],
];
const AMPLIA = /\b(?:liber\w*|permit\w*|retom\w*|volt\w* a|reativ\w*|pode (?:agendar|marcar|enviar|oferecer))\b/;

export interface InterpretacaoInstrucao {
  /** Pode ser ativada (sem bloqueio nem pendência de esclarecimento obrigatório). */
  ok: boolean;
  titulo: string;
  categoria: string;
  prioridade: PrioridadeInstrucao;
  tipo: 'temporaria' | 'permanente';
  inicio: string;
  fim: string | null;
  regras: RegraOperacional[];
  /** Frase objetiva para a confirmação antes de ativar. */
  resumo: string;
  afeta: string[];
  /** Pontos a confirmar (não impedem a ativação, mas aparecem na confirmação). */
  observacoes: string[];
  /** Precisa de esclarecimento: não ativa até a equipe completar/ajustar. */
  esclarecer: string[];
  /** Fora das competências ou contra regra fundamental: não ativa. */
  bloqueios: string[];
  origem: 'deterministica' | 'ia';
}

function automacaoDoTexto(t: string): AutomacaoSuspensivel | undefined {
  if (/\brelatorio\b.{0,30}\b(?:fernando|advogad\w*|pendencias)\b/.test(t)) return 'relatorio_advogado';
  if (/\bencaminh\w*\b.{0,30}\b(?:fernando|advogad\w*)\b/.test(t)) return 'encaminhamento_advogado';
  if (/\b(?:lembretes?|avisos?)\b.{0,40}\b(?:audiencias?|pericias?)\b/.test(t)) return 'eventos_processuais';
  if (/\b(?:coleta|documentos? (?:faltantes|pendentes)|cobranca de documentos|lembretes? de documentos?)\b/.test(t)) return 'coleta';
  if (/\b(?:vendedor|follow[- ]?up|lembretes? (?:para|aos?) (?:novos )?leads?)\b/.test(t)) return 'vendedor';
  if (/\b(?:reagend\w*|remarc\w*)\b/.test(t)) return 'reagendamento_automatico';
  if (/\bconfirmac(?:ao|oes)\b|\bconfirmar (?:a |as )?(?:presenca|consultas?)\b/.test(t)) return 'confirmacoes';
  if (/\blembretes?\b/.test(t)) return 'lembretes';
  return undefined;
}
const CATEGORIA_AUTOMACAO: Record<AutomacaoSuspensivel, string> = {
  lembretes: 'lembretes', confirmacoes: 'confirmacoes', reagendamento_automatico: 'reagendamentos', coleta: 'coleta_documentos', vendedor: 'automacoes',
  eventos_processuais: 'audiencias_pericias', relatorio_advogado: 'encaminhamento_humano', encaminhamento_advogado: 'encaminhamento_humano',
};
function categoriaComportamental(t: string): string {
  if (/\bclientes? (?:ativos|da casa|cadastrados)\b/.test(t)) return 'clientes_ativos';
  if (/\b(?:encaminh\w*|atendimento humano|equipe|fernando|advogad\w*)\b/.test(t)) return 'encaminhamento_humano';
  if (/\b(?:preco|valor|honorari\w*|desconto|pagamento|comercial)\b/.test(t)) return 'regras_comerciais';
  if (/\b(?:tom|linguagem|mensage\w*|responder|comunic\w*|emoji)\b/.test(t)) return 'comunicacao';
  if (/\b(?:novos clientes|leads?|primeiro contato|captacao)\b/.test(t)) return 'atendimento_inicial';
  if (/\bcancel\w*\b/.test(t)) return 'cancelamentos';
  return 'orientacoes_gerais';
}

/**
 * Interpreta a instrução escrita pela equipe. Determinístico (sem custo de IA): datas absolutas no fuso de São Paulo,
 * regras estruturadas e o que precisa de esclarecimento antes de ativar.
 */
export function interpretarInstrucao(texto: string, agora = new Date()): InterpretacaoInstrucao {
  const t = fold(texto);
  const tempo = interpretarTempo(t, agora);
  const bloqueios = PROIBIDO.filter(([re]) => re.test(t)).map(([, motivo]) => motivo);
  const esclarecer: string[] = [];
  const observacoes = [...tempo.notas];
  const regras: RegraOperacional[] = [];
  const restritiva = VERBO_RESTRITIVO.test(t) || /\b(?:somente|apenas|so|exclusivamente) (?:apos|depois|antes|a partir)\b/.test(t);
  const automacao = automacaoDoTexto(t);
  let categoria = 'orientacoes_gerais';
  if (restritiva && /\b(?:captacao|novos clientes|clientes novos|novos leads|leads novos|atender novos|primeiros? contatos?)\b/.test(t)) {
    regras.push({ tipo: 'suspender_captacao' }); categoria = 'atendimento_inicial';
  } else if (restritiva && automacao && !(automacao === 'reagendamento_automatico' && !/\bautomatic\w*\b/.test(t) && AGENDA.test(t) && !/\breagend\w*\b/.test(t))) {
    regras.push({ tipo: 'suspender_automacao', automacao }); categoria = CATEGORIA_AUTOMACAO[automacao];
  } else if (restritiva && (AGENDA_FORTE.test(t) || SINAL_JANELA_AGENDA.test(t)) && !/\bcancel\w*\b/.test(t)) {
    // Com período citado → bloqueia só esses horários (os seguintes continuam livres). Sem período, ou com "suspender/
    // pausar/parar" → suspende todos os novos agendamentos pela Anne enquanto a instrução vale.
    const limite = tempo.janela ?? (tempo.ate ? { inicio: tempo.aPartir ?? agora, fim: tempo.ate } : undefined);
    const explicita = SUSPENSAO_EXPLICITA.test(t);
    if (!explicita && limite) {
      categoria = 'disponibilidade_agenda';
      const ini = limite.inicio < agora ? agora : limite.inicio;
      if (limite.fim <= agora) esclarecer.push('O período informado já passou: ajuste as datas.');
      else if (limite.fim <= ini) esclarecer.push('O término ficou antes do início: ajuste o período.');
      else regras.push({ tipo: 'bloquear_periodo_agenda', inicio: ini.toISOString(), fim: limite.fim.toISOString() });
    } else if (!explicita && (SINAL_JANELA_AGENDA.test(t) || tempo.aPartir && !tempo.semFim)) {
      categoria = 'disponibilidade_agenda';
      esclarecer.push('Informe o período a bloquear na agenda (datas e horários), por exemplo "de 10/12 a 20/12" ou "amanhã das 14h às 17h".');
    } else {
      regras.push({ tipo: 'suspender_agendamentos' }); categoria = 'agendamentos';
    }
  } else {
    regras.push({ tipo: 'comportamental' }); categoria = categoriaComportamental(t);
    observacoes.push('Sem regra automática reconhecida: a Anne recebe o texto como orientação (o backend não bloqueia nada por ela).');
  }
  if (AMPLIA.test(t) && !restritiva) observacoes.push('Instruções só restringem ou orientam a Anne; para liberar algo suspenso, desative a instrução que suspende.');
  // Validade da instrução
  const janela = tempo.janela;
  const bloqueio = regras.find(r => r.tipo === 'bloquear_periodo_agenda');
  // Bloqueio de horários vale desde já (nenhum horário do período pode ser oferecido antes de ele começar).
  let inicio = bloqueio ? agora : tempo.aPartir ?? janela?.inicio ?? agora;
  if (inicio < agora) inicio = agora;
  let fim: Date | null = bloqueio ? new Date(bloqueio.fim) : tempo.ate ?? janela?.fim ?? null;
  if (!bloqueio && (tempo.semFim || tempo.permanente)) fim = null;
  const tipo: 'temporaria' | 'permanente' = tempo.permanente || (fim === null && !/\btemporari\w*\b/.test(t) && regras[0]?.tipo === 'comportamental') ? 'permanente' : 'temporaria';
  if (fim === null && tipo === 'temporaria') observacoes.push('Sem prazo informado: vale até ser desativada (até segunda ordem).');
  if (fim && fim <= inicio) esclarecer.push('O término ficou antes do início: ajuste o período.');
  if (/\bferias\b/.test(t) && !janela) esclarecer.push('Informe as datas das férias (início e fim).');
  const prioridade: PrioridadeInstrucao = /\b(?:critic\w*|emergenc\w*)\b/.test(t) ? 'critica' : /\b(?:urgente|imediat\w*|priorid\w*|importante)\b/.test(t) ? 'alta' : 'normal';
  const afeta = regras.map(descreverRegra);
  return {
    ok: !bloqueios.length && !esclarecer.length, titulo: texto.trim().replace(/\s+/g, ' ').slice(0, 70), categoria, prioridade, tipo,
    inicio: inicio.toISOString(), fim: fim ? fim.toISOString() : null, regras, resumo: resumoInstrucao(regras, inicio.toISOString(), fim ? fim.toISOString() : null), afeta, observacoes, esclarecer, bloqueios, origem: 'deterministica',
  };
}

/** O que a regra afeta, em português, para a confirmação e as listas. */
export function descreverRegra(r: RegraOperacional): string {
  return r.tipo === 'bloquear_periodo_agenda' ? `Oferta e reserva de horários pela Anne entre ${fmt(new Date(r.inicio))} e ${fmt(new Date(r.fim))} (horários depois continuam liberados; consultas já marcadas não são alteradas)`
    : r.tipo === 'suspender_agendamentos' ? 'Todos os novos agendamentos e remarcações pela Anne, em qualquer horário (consultas já marcadas não são alteradas)'
    : r.tipo === 'suspender_captacao' ? 'Oferta de consulta e agendamento para novos leads'
    : r.tipo === 'suspender_automacao' ? `Automação: ${AUTOMACOES_SUSPENSIVEIS[r.automacao]}`
    : 'Orientação no contexto da Anne (sem bloqueio automático)';
}
export function resumoInstrucao(regras: RegraOperacional[], inicio: string, fim: string | null): string {
  return `${regras.map(descreverRegra).join('; ')} — vale de ${fmt(new Date(inicio))} ${fim ? `até ${fmt(new Date(fim))}` : 'até ser desativada'} (horário de Brasília).`;
}

/** Ajustes feitos pela equipe na confirmação (validade, período bloqueado, título, categoria, prioridade). */
export interface AjustesInstrucao {
  titulo?: string | undefined;
  categoria?: string | undefined;
  prioridade?: PrioridadeInstrucao | undefined;
  tipo?: 'temporaria' | 'permanente' | undefined;
  inicio?: string | undefined;
  /** null = sem término (até ser desativada); undefined = mantém o interpretado. */
  fim?: string | null | undefined;
  /** Período bloqueado na agenda (esclarece "férias"/"bloquear a agenda" ou corrige o interpretado). */
  periodoBloqueio?: { inicio: string; fim: string } | undefined;
  /** A equipe corrige uma leitura automática: só orientação no contexto da Anne, sem bloqueio no servidor. */
  somenteOrientacao?: boolean | undefined;
}
export type DadosInstrucao = Parameters<typeof novaInstrucao>[0];

/**
 * Validação final no servidor (criação e edição): reinterpreta o texto, aplica os ajustes confirmados, recusa o que é
 * proibido, ambíguo sem esclarecimento, vencido ou em conflito. O navegador nunca define as regras diretamente.
 */
export function prepararInstrucao(texto: string, ajustes: AjustesInstrucao, existentes: InstrucaoOperacional[], agora = new Date(), id?: string):
  { ok: true; dados: Omit<DadosInstrucao, 'id'>; interpretacao: InterpretacaoInstrucao; avisos: string[] } | { ok: false; erros: string[]; interpretacao?: InterpretacaoInstrucao } {
  const t = texto.trim().replace(/[ \t]+/g, ' ');
  if (t.length < 5 || t.length > 1000) return { ok: false, erros: ['Escreva a instrução (de 5 a 1000 caracteres).'] };
  const interp = interpretarInstrucao(t, agora);
  const erros = [...interp.bloqueios];
  let regras = interp.regras;
  const pb = ajustes.periodoBloqueio;
  let periodoResolvido = false;
  if (pb) {
    if (!ISO(pb.inicio) || !ISO(pb.fim) || Date.parse(pb.fim) <= Date.parse(pb.inicio)) erros.push('Período bloqueado inválido: o término precisa ser depois do início.');
    else if (Date.parse(pb.fim) <= agora.getTime()) erros.push('O período bloqueado já terminou.');
    else {
      const janela = { tipo: 'bloquear_periodo_agenda' as const, inicio: new Date(pb.inicio).toISOString(), fim: new Date(pb.fim).toISOString() };
      const agendaSemPeriodo = interp.esclarecer.some(e => /per[ií]odo a bloquear|datas das f[eé]rias/.test(e));
      if (regras.some(r => r.tipo === 'bloquear_periodo_agenda')) { regras = regras.map(r => r.tipo === 'bloquear_periodo_agenda' ? janela : r); periodoResolvido = true; }
      else if (agendaSemPeriodo) { regras = [janela]; periodoResolvido = true; }
    }
  }
  const avisosOrientacao: string[] = [];
  if (ajustes.somenteOrientacao) {
    regras = [{ tipo: 'comportamental' }];
    periodoResolvido = true;
    avisosOrientacao.push('Marcada como só orientação: nada é bloqueado automaticamente; a Anne recebe o texto como orientação.');
  }
  const esclarecer = interp.esclarecer.filter(e => !(periodoResolvido && /per[ií]odo a bloquear|datas das f[eé]rias|per[ií]odo informado/.test(e)) && !(ajustes.fim !== undefined && /t[eé]rmino ficou antes/.test(e)));
  erros.push(...esclarecer);
  const tipo = ajustes.tipo ?? interp.tipo;
  let inicio = ajustes.inicio !== undefined ? ajustes.inicio : interp.inicio;
  let fim = tipo === 'permanente' ? null : ajustes.fim !== undefined ? ajustes.fim : interp.fim;
  if (!ISO(inicio)) erros.push('Início inválido.');
  if (fim !== null && !ISO(fim)) erros.push('Término inválido.');
  const avisos = [...interp.observacoes.filter(o => !(ajustes.somenteOrientacao && /Sem regra autom/.test(o))), ...avisosOrientacao];
  const fimBloqueio = Math.max(0, ...regras.flatMap(r => (r.tipo === 'bloquear_periodo_agenda' ? [Date.parse(r.fim)] : [])));
  if (!erros.length) {
    inicio = new Date(inicio).toISOString();
    // Bloqueio de horários vale desde já: nenhum horário do período pode ser oferecido antes de ele começar.
    if (fimBloqueio && Date.parse(inicio) > agora.getTime()) { inicio = agora.toISOString(); avisos.push('Bloqueio de horários passa a valer agora, para que nenhum horário do período seja oferecido antes.'); }
    if (fim !== null) {
      fim = new Date(fim).toISOString();
      if (fimBloqueio && Date.parse(fim) < fimBloqueio) { fim = new Date(fimBloqueio).toISOString(); avisos.push('O término foi estendido até o fim do período bloqueado.'); }
      if (Date.parse(fim) <= Date.parse(inicio)) erros.push('O término precisa ser depois do início.');
      else if (Date.parse(fim) <= agora.getTime()) erros.push('O término já passou: a instrução nasceria expirada.');
    }
  }
  const categoria = ajustes.categoria && /^[a-z_]{3,40}$/.test(ajustes.categoria) ? ajustes.categoria : interp.categoria;
  const prioridade = ajustes.prioridade ?? interp.prioridade;
  const titulo = (ajustes.titulo?.trim() || interp.titulo).replace(/\s+/g, ' ').slice(0, 80);
  if (!erros.length) {
    const { conflitos, redundantes } = conflitosInstrucao({ regras, inicio, fim, titulo, texto: t, ...(id ? { id } : {}) }, existentes, agora);
    erros.push(...conflitos);
    avisos.push(...redundantes);
  }
  if (erros.length) return { ok: false, erros: [...new Set(erros)], interpretacao: interp };
  return { ok: true, interpretacao: interp, avisos, dados: { texto: t, titulo, categoria, prioridade, tipo, inicio, fim, regras, interpretacao: resumoInstrucao(regras, inicio, fim) } };
}

// ---------- Conflitos ----------
const chaveRegra = (r: RegraOperacional) => r.tipo === 'suspender_automacao' ? `${r.tipo}:${r.automacao}` : r.tipo;
const sobrepoe = (a: { inicio: string; fim: string | null }, b: { inicio: string; fim: string | null }) =>
  Date.parse(a.inicio) < (b.fim ? Date.parse(b.fim) : Infinity) && Date.parse(b.inicio) < (a.fim ? Date.parse(a.fim) : Infinity);
/**
 * Conflito: instrução que tenta liberar o que outra vigente/programada restringe no mesmo período, ou orientação
 * comportamental que contradiz uma suspensão (ex.: "oferecer consultas" com agendamentos suspensos). Redundância
 * (mesma restrição já existente) é só observação.
 */
export function conflitosInstrucao(nova: Pick<InterpretacaoInstrucao, 'regras' | 'inicio' | 'fim' | 'titulo'> & { texto: string; id?: string }, existentes: InstrucaoOperacional[], agora = new Date()): { conflitos: string[]; redundantes: string[] } {
  const t = fold(nova.texto);
  const outras = existentes.filter(i => i.id !== nova.id && ['ativa', 'programada'].includes(situacaoInstrucao(i, agora)) && sobrepoe(i, nova));
  const conflitos: string[] = [], redundantes: string[] = [];
  const amplia = AMPLIA.test(t) || /\b(?:oferecer|agendar|marcar|enviar)\b/.test(t) && !VERBO_RESTRITIVO.test(t);
  for (const i of outras) {
    const restritivas = i.regras.filter(r => r.tipo !== 'comportamental');
    if (amplia && restritivas.some(r => (r.tipo === 'suspender_agendamentos' || r.tipo === 'bloquear_periodo_agenda' || r.tipo === 'suspender_captacao') && AGENDA.test(t) || r.tipo === 'suspender_automacao' && automacaoDoTexto(t) === r.automacao)) {
      conflitos.push(`Conflita com "${i.titulo}" (${ROTULO_SITUACAO[situacaoInstrucao(i, agora)].toLowerCase()}, ${dataHoraSP(i.inicio)} → ${dataHoraSP(i.fim)}): desative-a em vez de criar uma instrução contrária.`);
      continue;
    }
    const iguais = nova.regras.filter(r => r.tipo !== 'comportamental' && r.tipo !== 'bloquear_periodo_agenda' && restritivas.some(x => chaveRegra(x) === chaveRegra(r)));
    if (iguais.length) redundantes.push(`Já existe "${i.titulo}" com a mesma restrição nesse período.`);
  }
  return { conflitos, redundantes };
}

/** Consultas já marcadas dentro dos períodos bloqueados (para avisar a equipe; nada é cancelado ou alterado). */
export function consultasNoPeriodo(regras: RegraOperacional[], consultas: { conversaId: string; inicio: string }[]): { conversaId: string; inicio: string }[] {
  const janelas = regras.filter((r): r is Extract<RegraOperacional, { tipo: 'bloquear_periodo_agenda' }> => r.tipo === 'bloquear_periodo_agenda');
  return consultas.filter(c => janelas.some(j => { const a = Date.parse(c.inicio); return a < Date.parse(j.fim) && a + 30 * 60000 > Date.parse(j.inicio); }));
}

/** Nova instrução a partir da interpretação confirmada (o servidor revalida antes de gravar). */
export function novaInstrucao(dados: { id: string; texto: string; titulo: string; categoria: string; prioridade: PrioridadeInstrucao; tipo: 'temporaria' | 'permanente'; inicio: string; fim: string | null; regras: RegraOperacional[]; interpretacao: string }, por: string, agora = new Date()): InstrucaoOperacional {
  const stamp = agora.toISOString();
  return { ...dados, status: 'ativa', criadoPor: por, criadoEm: stamp, versao: 1, historico: [{ em: stamp, por, acao: 'criada e ativada' }] };
}
/** Edição de instrução ativa/programada: nova versão, histórico preservado (expirada/desativada não é editada). */
export function editarInstrucao(atual: InstrucaoOperacional, dados: Omit<DadosInstrucao, 'id'>, por: string, agora = new Date()): InstrucaoOperacional {
  const stamp = agora.toISOString();
  const versao = atual.versao + 1;
  return { ...atual, ...dados, status: 'ativa', atualizadoPor: por, atualizadoEm: stamp, versao, historico: [...atual.historico, { em: stamp, por, acao: `editada (versão ${versao})` }].slice(-50) };
}
/** Desativação imediata (vale na próxima leitura da Anne e das rotinas); o registro fica no histórico. */
export function desativarInstrucao(atual: InstrucaoOperacional, por: string, agora = new Date()): InstrucaoOperacional {
  if (atual.status === 'desativada') return atual;
  const stamp = agora.toISOString();
  return { ...atual, status: 'desativada', desativadoPor: por, desativadoEm: stamp, historico: [...atual.historico, { em: stamp, por, acao: 'desativada' }].slice(-50) };
}
/** Mantém o histórico sem crescer sem limite: vigentes/programadas sempre ficam; das encerradas, as 150 mais recentes. */
export function limitarHistorico(lista: InstrucaoOperacional[], agora = new Date()): InstrucaoOperacional[] {
  const abertas = lista.filter(i => ['ativa', 'programada'].includes(situacaoInstrucao(i, agora)));
  const encerradas = lista.filter(i => !abertas.includes(i)).sort((a, b) => Date.parse(b.desativadoEm ?? b.fim ?? b.criadoEm) - Date.parse(a.desativadoEm ?? a.fim ?? a.criadoEm)).slice(0, 150);
  return lista.filter(i => abertas.includes(i) || encerradas.includes(i));
}

/** Tempo até `alvo` para as listas ("2 h 15 min", "3 dias"); vazio quando já passou ou sem prazo. */
export function tempoAte(alvo: string | null, agora = new Date()): string {
  if (!alvo) return '';
  const min = Math.ceil((Date.parse(alvo) - agora.getTime()) / 60000);
  if (!(min > 0)) return '';
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min` : `${h} h`; }
  return `${Math.round(min / 1440)} dias`;
}

/** Valida regras vindas da tela ou da IA (mesmas regras de leitura). */
export function validarRegras(regras: unknown[]): RegraOperacional[] {
  return regras.map(regraValida).filter((r): r is RegraOperacional => !!r);
}
