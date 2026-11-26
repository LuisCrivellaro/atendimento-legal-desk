/**
 * Classificação de notícias processuais antes de qualquer contato com o cliente.
 * A notícia continua passando pela aprovação da revisora (regra existente); aqui só se decide o que nem pode
 * ir para aprovação (privado, segredo, sem vínculo confirmado, dados desatualizados) e o que é sensível
 * (exige interpretação) para destacar na revisão. Nunca há envio automático de andamento.
 */

export interface AndamentoCandidato {
  texto: string;
  /** Ausente = privado (regra do ProJuris: proteger por padrão). */
  privado?: boolean | undefined;
  /** Ausente = segredo de justiça. */
  segredo?: boolean | undefined;
  /** Vínculo do telefone com a pessoa do cadastro confirmado (telefone principal único ou CPF confirmado pela equipe). */
  vinculoConfirmado: boolean;
  /** Quando a réplica foi lida da fonte oficial. */
  verificadoEm?: string | undefined;
}

export type ClassificacaoAndamento =
  | { decisao: 'aprovacao'; sensivel: boolean; motivos: string[] }
  | { decisao: 'bloquear'; motivos: string[] };

/** Termos que exigem interpretação jurídica ou podem causar dano se comunicados sem contexto. */
const SENSIVEIS: [RegExp, string][] = [
  [/\bsentenc/, 'sentença'],
  [/\bacord[aã]o\b/, 'acórdão'],
  [/\b(?:im)?procedente\b|\bimprocedencia\b|\bprocedencia\b/, 'resultado do pedido'],
  [/\bindefer|\bdefer(?:i|iment)/, 'deferimento/indeferimento'],
  [/\bliminar|\btutela\b/, 'tutela/liminar'],
  [/\bpenhora|\bbloqueio\b|\bsisbajud|\bbacenjud/, 'constrição patrimonial'],
  [/\bacordo\b|\bproposta\b/, 'acordo'],
  [/\bvalor(?:es)?\b|\bcalculo|\br\$|\balvara|\bprecatori|\brpv\b/, 'valores'],
  [/\bprazo\b|\brecurso\b|\bapelac|\bembargos?\b|\bagravo\b/, 'prazo ou recurso'],
  [/\barquiv(?:ado|amento)\b|\bextint|\bextinc/, 'arquivamento/extinção'],
  [/\bobito|\bfalec/, 'óbito'],
  [/\bperici|\blaudo\b/, 'perícia/laudo'],
];

const MAX_IDADE_MS = 24 * 3600000;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function classificarAndamento(a: AndamentoCandidato, agora = new Date()): ClassificacaoAndamento {
  const bloqueios: string[] = [];
  if (a.privado !== false) bloqueios.push('movimentação privada ou sem informação de privacidade');
  if (a.segredo !== false) bloqueios.push('segredo de justiça ou sem informação de sigilo');
  if (!a.vinculoConfirmado) bloqueios.push('vínculo do contato com o cadastro não confirmado');
  const lido = Date.parse(a.verificadoEm ?? '');
  if (!Number.isFinite(lido) || agora.getTime() - lido > MAX_IDADE_MS) bloqueios.push('dados desatualizados: sincronizar com a fonte oficial antes');
  if (!a.texto.trim()) bloqueios.push('movimentação sem texto');
  if (bloqueios.length) return { decisao: 'bloquear', motivos: bloqueios };
  const t = fold(a.texto);
  const motivos = SENSIVEIS.filter(([r]) => r.test(t)).map(([, m]) => m);
  return { decisao: 'aprovacao', sensivel: motivos.length > 0, motivos: motivos.length ? motivos : ['notícia objetiva: aprovação da revisora continua obrigatória'] };
}
