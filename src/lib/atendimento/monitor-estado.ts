/** Estado do monitor operacional (gravado pelo servidor em `ana_monitoramento`, id `monitor-operacional`). Puro: usado também pela tela. */

export const ID_MONITOR = 'monitor-operacional';
export const INTERVALO_MONITOR_MIN = 5;
/** Sem execução há mais que isto: alerta de rotina parada. */
export const ATRASO_ALERTA_MIN = 15;

/** Resumo serializável de uma etapa: contagens, textos curtos e contagem de motivos (nada de dado de cliente). */
export type ValorResumo = string | number | boolean | Record<string, number>;

/** Converte o retorno de uma rotina em resumo seguro (descarta o que não for contagem ou texto curto). */
export function resumoSeguro(obj: unknown): Record<string, ValorResumo> {
  const saida: Record<string, ValorResumo> = {};
  if (!obj || typeof obj !== 'object') return saida;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'number' || typeof v === 'boolean') saida[k] = v;
    else if (typeof v === 'string') saida[k] = v.slice(0, 120);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const contagens = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number').slice(0, 20));
      if (Object.keys(contagens).length) saida[k] = contagens;
    }
  }
  return saida;
}

export interface ResultadoEtapa {
  ok: boolean;
  executadoEm: string;
  duracaoMs: number;
  resumo?: Record<string, ValorResumo> | undefined;
  erro?: string | undefined;
  pulada?: string | undefined;
}

export interface EstadoMonitor {
  ultimaExecucao: string;
  proximaPrevista: string;
  duracaoMs: number;
  ok: boolean;
  etapas: Record<string, ResultadoEtapa>;
  integracoes: { projuris: 'ok' | 'falha' | 'nao_verificado'; whatsapp: 'ativo' | 'desligado' | 'desconhecido' };
  pendenciasAgenda: { quando: string; titulo: string; motivo: string }[];
  historico: { em: string; ok: boolean; duracaoMs: number; falhas: string[] }[];
}

export const ROTULOS_ETAPA: Record<string, string> = {
  'agenda-projuris': 'Agenda do ProJuris (consultas marcadas, alteradas e canceladas)',
  confirmacoes: 'Confirmação de presença',
  lembretes: 'Lembrete das 08h',
  'registro-consultas': 'Registro de consultas realizadas/faltas',
  'pendencias-processo': 'Notícias processuais pendentes',
  'recuperar-ana': 'Recuperação de respostas da Anne',
  coleta: 'Contrato e documentos pendentes',
  vendedor: 'Follow-up comercial',
  'reservas-pendentes': 'Reservas provisórias lançadas no ProJuris',
  'relatorio-diario': 'Relatório diário',
};

/** Rotina parada: última execução há mais de 15 minutos (ou nunca executou). */
export function monitorAtrasado(estado: Pick<EstadoMonitor, 'ultimaExecucao'> | null | undefined, agora = new Date()) {
  const t = Date.parse(estado?.ultimaExecucao ?? '');
  return !Number.isFinite(t) || agora.getTime() - t > ATRASO_ALERTA_MIN * 60000;
}
