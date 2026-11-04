// Agenda do ProJuris — parte pura (sem rede nem banco): normalização, sobreposição e montagem de corpos.
// Os campos seguem a documentação oficial (docs.projurisadv.com.br): datas em milissegundos (epoch).

export interface CompromissoPJ {
  codigo: number;
  titulo: string;
  inicioMs: number;
  fimMs: number;
  concluido: boolean;
  codigoExterno?: string | undefined;
}

/** Verdadeiro quando os intervalos [aIni,aFim) e [bIni,bFim) se cruzam. */
export function sobrepoe(aIni: number, aFim: number, bIni: number, bFim: number): boolean {
  return aIni < bFim && bIni < aFim;
}

function numero(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Lê um item de tarefaConsultaWs da consulta de compromissos; devolve undefined quando incompleto. */
export function compromissoDe(item: unknown): CompromissoPJ | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const o = item as Record<string, unknown>;
  const codigo = numero(o['codigoTarefaEvento']) ?? numero(o['codigoTarefa']);
  // Confirmado contra a API real (04/11/2026): dataInicioCompromisso/dataFimCompromisso já são o instante
  // completo em ms (horaInicioCompromisso repete o mesmo valor); nunca somar os campos.
  const inicioMs = numero(o['dataInicioCompromisso']);
  const fimMs = numero(o['dataFimCompromisso']) ?? inicioMs;
  if (codigo === undefined || inicioMs === undefined) return undefined;
  return {
    codigo,
    titulo: typeof o['titulo'] === 'string' ? o['titulo'] : '',
    inicioMs,
    fimMs: fimMs ?? inicioMs,
    concluido: o['flagCompromissoConcluido'] === true || o['flagSituacaoConcluida'] === true,
    codigoExterno: typeof o['codigoExterno'] === 'string' && o['codigoExterno'] ? o['codigoExterno'] : undefined,
  };
}

/** Extrai a lista plana de compromissos da resposta agrupada da consulta de compromissos. */
export function compromissosDaResposta(raw: unknown): CompromissoPJ[] {
  if (!raw || typeof raw !== 'object') return [];
  const grupos = (raw as Record<string, unknown>)['tarefasAgrupadasDataTipoWs'];
  const lista = Array.isArray(grupos) ? grupos : [raw];
  const saida: CompromissoPJ[] = [];
  for (const g of lista) {
    const itens = g && typeof g === 'object' ? (g as Record<string, unknown>)['tarefaConsultaWs'] : undefined;
    for (const i of Array.isArray(itens) ? itens : itens ? [itens] : []) {
      const c = compromissoDe(i);
      if (c) saida.push(c);
    }
  }
  return saida;
}

/** Corpo da consulta de compromissos entre dois instantes (ms).
 *  Confirmado contra a API real (04/11/2026): o filtro de período é dataInicio/dataFim;
 *  dataTarefaInicio/dataTarefaFim existe na especificação mas devolve lista vazia. */
export function corpoConsultaCompromissos(inicioMs: number, fimMs: number) {
  return {
    dataInicio: inicioMs,
    dataFim: fimMs,
    flagCompromisso: true,
    flagCompromissoConcluido: false,
  };
}

/** Tipo de compromisso das consultas criadas pela Anne: "Atendimento inicial" (escolha da Dra. em 04/11/2026). */
export const TIPO_COMPROMISSO_CONSULTA = 6683563;

/** Responsável padrão dos compromissos criados pela integração: Dra. Carolina (confirmado em compromisso real). */
export const RESPONSAVEL_PADRAO = { chave: 176189, valor: 'CAROLINA RIBEIRO ALVES DOS SANTOS ' };

/** Meia-noite do dia em São Paulo (ms UTC) — campo dataBase exigido pela API de criação. */
export function meiaNoiteSaoPaulo(ms: number): number {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const [a, m, d] = partes.split('-').map(Number);
  if (a === undefined || m === undefined || d === undefined) throw new Error('Data inválida.');
  return Date.UTC(a, m - 1, d, 3); // sem horário de verão no Brasil: meia-noite SP = 03:00 UTC
}

/** Corpo de criação (json_TarefaWs) no formato comprovado contra a API real em 04/11/2026:
 *  dataHoraInicio/dataHoraFim + dataBase (meia-noite SP) + responsável com chave e valor;
 *  sem tipoEvento e sem dataConclusao (a API recusa com 500 quando o formato diverge).
 *  codigoExterno garante idempotência: prefixo fixo do Manager ADV. */
export function corpoCriacaoCompromisso(d: {
  titulo: string;
  inicioMs: number;
  fimMs: number;
  codigoExterno: string;
  descricao?: string;
  responsavel?: { chave: number; valor: string };
  codigoTarefaTipo?: number;
}) {
  return {
    compromisso: true,
    codigoExterno: d.codigoExterno,
    tarefaCompromissoEventoWs: {
      titulo: d.titulo,
      descricaoTarefa: d.descricao ?? '',
      tipoTarefa: { chave: d.codigoTarefaTipo ?? TIPO_COMPROMISSO_CONSULTA, valor: 'Atendimento inicial' },
      usuariosResponsaveis: [d.responsavel ?? RESPONSAVEL_PADRAO],
      dataHoraInicio: d.inicioMs,
      dataHoraFim: d.fimMs,
      dataBase: meiaNoiteSaoPaulo(d.inicioMs),
      concluido: false,
      privado: false,
      tarefaPrivada: false,
      kanban: false,
      notificaClienteCriacao: false,
      notificaResponsavelCriacao: false,
      notificaTerceirosCriacao: false,
      notificaClienteConclusao: false,
      notificaResponsavelConclusao: false,
      notificaTerceirosConclusao: false,
    },
  };
}

/** Prefixo dos códigos externos criados pelo Manager ADV — nunca colide com lançamentos manuais. */
export const PREFIXO_EXTERNO_MANAGER = 'manageradv:';

export function codigoExternoConsulta(casoId: string, inicioMs: number): string {
  return `${PREFIXO_EXTERNO_MANAGER}consulta:${casoId}:${inicioMs}`;
}
