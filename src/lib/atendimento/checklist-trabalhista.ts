import type { Conversa } from '../mock-data';

/**
 * Checklist trabalhista (modelo oficial T09). A Anne nunca decide sozinha que um caso é trabalhista: o envio só
 * acontece por autorização explícita da equipe, que confirma a classificação no mesmo ato. Os documentos e as
 * perguntas do T09 viram itens estruturados do checklist (sem duplicar os documentos base já pedidos pelo T05),
 * e os lembretes de faltantes cobram só o que continua pendente — nunca o checklist inteiro de novo.
 */

/** Itens do T09 que não repetem os documentos base do Trato feito (RG/CNH e comprovante já vêm do T05). */
export const ITENS_T09 = [
  'CTPS (páginas do contrato e anotações)',
  'Contrato de trabalho (se houver)',
  'Recibos ou holerites do período trabalhado',
  'Extrato do FGTS',
  'TRCT (se recebeu)',
  'Histórico da relação de trabalho (entrada, saída e motivo)',
  'Jornada combinada e praticada',
  'Atividade contratada e atividade real',
  'Tratamento inadequado ou assédio (se houve)',
  'Filhos menores (quantos e idades)',
  'Vale-transporte e vale-alimentação (valores)',
] as const;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Itens do T09 ainda ausentes do checklist (comparação sem acento/maiúsculas). */
export function itensNovosT09(existentes: string[]): string[] {
  const ja = new Set(existentes.map(fold));
  return ITENS_T09.filter(i => !ja.has(fold(i)));
}

/** Inclui itens no checklist da conversa sem duplicar nem desmarcar os já recebidos. */
export function comItensT09(docs: Conversa['documentos'], itens: string[]): Conversa['documentos'] {
  const ja = new Set(docs.map(d => fold(d.nome)));
  return [...docs, ...itens.filter(i => !ja.has(fold(i))).map(nome => ({ nome, recebido: false }))];
}

export type BloqueioT09 = 'ja_enviado' | 'sem_contato' | 'modelo_indisponivel' | 'conversa_bloqueada';

/** Conferências antes do envio do T09 (puras; o servidor relê a conversa dentro da escrita CAS). */
export function bloqueioT09(c: Pick<Conversa, 'agenteAna' | 'modoIA'>, contato: string | undefined): BloqueioT09 | undefined {
  const t = c.agenteAna?.checklistTrabalhista;
  if (t?.enviadoEm || t?.reservadoEm) return 'ja_enviado';
  if (!contato) return 'sem_contato';
  return undefined;
}

export const TEXTO_BLOQUEIO_T09: Record<BloqueioT09, string> = {
  ja_enviado: 'O checklist trabalhista (T09) já foi enviado ou está em envio nesta conversa.',
  sem_contato: 'Contato de WhatsApp desta conversa não está liberado: nada foi enviado.',
  modelo_indisponivel: 'Modelo oficial T09 indisponível na biblioteca: nada foi enviado.',
  conversa_bloqueada: 'Conversa bloqueada para envios automáticos.',
};
