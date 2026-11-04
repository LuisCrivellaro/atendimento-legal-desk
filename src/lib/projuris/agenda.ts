// Agenda do ProJuris — parte pura (sem rede nem banco): normalização, sobreposição e montagem de corpos.
// Os campos seguem a documentação oficial (docs.projurisadv.com.br): datas em milissegundos (epoch).

export interface CompromissoPJ {
  codigo: number;
  titulo: string;
  inicioMs: number;
  fimMs: number;
  concluido: boolean;
  codigoExterno?: string;
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

/** Corpo da consulta de compromissos entre dois instantes (ms). */
export function corpoConsultaCompromissos(inicioMs: number, fimMs: number) {
  return {
    dataTarefaInicio: inicioMs,
    dataTarefaFim: fimMs,
    flagCompromisso: true,
    flagCompromissoConcluido: false,
  };
}

/** Corpo de criação (json_TarefaWs). codigoExterno garante idempotência: prefixo fixo do Manager ADV. */
export function corpoCriacaoCompromisso(d: {
  titulo: string;
  inicioMs: number;
  fimMs: number;
  codigoExterno: string;
  descricao?: string;
  codigoUsuarioResponsavel?: number;
}) {
  return {
    compromisso: true,
    codigoExterno: d.codigoExterno,
    tarefaCompromissoEventoWs: {
      titulo: d.titulo,
      descricaoTarefa: d.descricao ?? '',
      tipoEvento: 'COMPROMISSO',
      dataHoraInicio: d.inicioMs,
      dataHoraFim: d.fimMs,
      privado: false,
      notificaClienteCriacao: false,
      notificaResponsavelCriacao: true,
      notificaTerceirosCriacao: false,
      ...(d.codigoUsuarioResponsavel
        ? { usuariosResponsaveis: [{ chave: d.codigoUsuarioResponsavel }] }
        : {}),
    },
  };
}

/** Prefixo dos códigos externos criados pelo Manager ADV — nunca colide com lançamentos manuais. */
export const PREFIXO_EXTERNO_MANAGER = 'manageradv:';

export function codigoExternoConsulta(casoId: string, inicioMs: number): string {
  return `${PREFIXO_EXTERNO_MANAGER}consulta:${casoId}:${inicioMs}`;
}
