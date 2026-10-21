// Mensagens prontas do Atendimento: biblioteca padrão + mensagens criadas pela equipe.
// Regras puras (sem React, sem banco) para poderem ser testadas.
import type { Conversa, Etapa } from './mock-data';
import { normalized } from './atendimento';

export const REPLY_CATEGORIES = ['Boas-vindas', 'Documentos', 'Agendamento', 'Processo', 'Geral'] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export interface QuickReply {
  id: string;
  titulo: string;
  texto: string;
  categoria: ReplyCategory;
  /** Digitado depois da barra na caixa de mensagem, ex.: "ola" para /ola. */
  atalho: string;
  /** Etapas em que a mensagem aparece como sugestão rápida. */
  etapas?: Etapa[] | undefined;
  padrao?: boolean | undefined;
}

/** O que fica salvo na área de trabalho do usuário (raiz do office_workspace, como as automações). */
export interface SavedReplies {
  itens: QuickReply[];
  /** Mensagens padrão que o usuário removeu da lista. */
  ocultas: string[];
}

export const VARIABLES = [
  { key: 'nome', label: 'Primeiro nome' },
  { key: 'nome_completo', label: 'Nome completo' },
  { key: 'documentos_faltantes', label: 'Documentos faltantes' },
  { key: 'atendimento', label: 'Nº do atendimento' },
] as const;

export const DEFAULT_REPLIES: QuickReply[] = [
  { id: 'ola', titulo: 'Saudação', categoria: 'Boas-vindas', atalho: 'ola', etapas: ['inicial'], texto: 'Olá, {nome}! Aqui é a assessora da Dra. Carolina Santos. Como posso ajudar?' },
  { id: 'entender', titulo: 'Entender o caso', categoria: 'Boas-vindas', atalho: 'caso', etapas: ['inicial'], texto: '{nome}, para entendermos melhor, pode me contar em poucas palavras o que aconteceu e desde quando?' },
  { id: 'recebido', titulo: 'Documento recebido', categoria: 'Documentos', atalho: 'recebido', etapas: ['documentos'], texto: 'Recebemos seu documento, {nome}. Vamos conferir o conteúdo e avisamos se faltar algo.' },
  { id: 'faltam', titulo: 'Lembrar documentos faltantes', categoria: 'Documentos', atalho: 'faltam', etapas: ['documentos'], texto: '{nome}, ainda precisamos destes documentos: {documentos_faltantes}. Pode enviar por aqui mesmo, em foto ou PDF.' },
  { id: 'foto', titulo: 'Foto ilegível', categoria: 'Documentos', atalho: 'foto', texto: '{nome}, a imagem ficou difícil de ler. Pode enviar novamente com boa iluminação, mostrando o documento inteiro?' },
  { id: 'horario-ok', titulo: 'Horário anotado', categoria: 'Agendamento', atalho: 'anotado', texto: 'Perfeito, {nome}! Vou confirmar o horário com a advogada e já retorno.' },
  { id: 'andamento', titulo: 'Consultar andamento', categoria: 'Processo', atalho: 'andamento', etapas: ['ativo'], texto: '{nome}, vou consultar o andamento do seu processo e retorno em breve.' },
  { id: 'sem-novidades', titulo: 'Sem novidades no processo', categoria: 'Processo', atalho: 'novidades', etapas: ['ativo'], texto: '{nome}, conferimos o seu processo e ainda não há novidades. Assim que houver qualquer movimentação, avisamos você por aqui.' },
  { id: 'verificar', titulo: 'Vou verificar com a advogada', categoria: 'Geral', atalho: 'verificar', etapas: ['inicial', 'documentos', 'ativo'], texto: '{nome}, vou verificar com a advogada responsável e retorno em breve.' },
  { id: 'obrigada', titulo: 'Agradecer', categoria: 'Geral', atalho: 'obrigada', texto: 'Obrigada, {nome}! Estamos à disposição.' },
].map((r) => ({ ...r, padrao: true }) as QuickReply);

export const emptySaved: SavedReplies = { itens: [], ocultas: [] };

/** Lista final: padrão (menos ocultas e substituídas) + mensagens da equipe, na ordem das categorias. */
export function mergeReplies(saved?: Partial<SavedReplies>): QuickReply[] {
  const itens = saved?.itens ?? [];
  const ocultas = new Set(saved?.ocultas ?? []);
  const own = new Map(itens.map((r) => [r.id, r]));
  const base = DEFAULT_REPLIES.filter((r) => !ocultas.has(r.id)).map((r) => own.get(r.id) ?? r);
  const extra = itens.filter((r) => !DEFAULT_REPLIES.some((d) => d.id === r.id));
  const order = (c: ReplyCategory) => REPLY_CATEGORIES.indexOf(c);
  return [...base, ...extra].map((r, i) => ({ r, i })).sort((a, b) => order(a.r.categoria) - order(b.r.categoria) || a.i - b.i).map((x) => x.r);
}

/** Troca as variáveis conhecidas pelos dados do cliente. Campos livres (ex.: {data}) ficam para a atendente preencher. */
export function fillReply(texto: string, c: Pick<Conversa, 'nome' | 'atendimento' | 'documentos'>): string {
  const faltantes = c.documentos.filter((d) => !d.recebido).map((d) => d.nome);
  const values: Record<string, string> = {
    nome: c.nome.split(' ')[0] ?? c.nome,
    nome_completo: c.nome,
    documentos_faltantes: faltantes.length ? faltantes.join(', ') : 'nenhum documento pendente',
    atendimento: c.atendimento,
  };
  return texto.replace(/\{([a-z_]+)\}/gi, (all, key: string) => values[key.toLowerCase()] ?? all);
}

/** Campos entre chaves que ainda precisam ser preenchidos antes de enviar. */
export function pendingFields(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([^{}\n]{1,40})\}/g)].map((m) => m[1]!))];
}

/** Até `limit` sugestões para a conversa: primeiro o que combina com a última mensagem, depois com a etapa. */
export function suggestedReplies(c: Pick<Conversa, 'etapa' | 'mensagens' | 'documentos'>, replies: QuickReply[], limit = 4): QuickReply[] {
  const last = c.mensagens.at(-1);
  const first: string[] = [];
  if (last?.de === 'cliente' && last.arquivo) first.push('recebido');
  if (last?.de === 'cliente' && /obrigad/i.test(last.texto)) first.push('obrigada');
  const picked = [
    ...first.map((id) => replies.find((r) => r.id === id)),
    ...replies.filter((r) => r.etapas?.includes(c.etapa)),
  ].filter((r): r is QuickReply => Boolean(r));
  const unique = picked.filter((r, i) => picked.findIndex((x) => x.id === r.id) === i);
  const withoutUseless = unique.filter((r) => r.id !== 'faltam' || c.documentos.some((d) => !d.recebido));
  return withoutUseless.slice(0, limit);
}

/** Busca por título, atalho ou texto, sem diferenciar acentos e maiúsculas. Atalho exato vem primeiro. */
export function searchReplies(replies: QuickReply[], query: string): QuickReply[] {
  const q = normalized(query.replace(/^\//, ''));
  if (!q) return replies;
  const score = (r: QuickReply) => {
    const atalho = normalized(r.atalho);
    if (atalho === q) return 0;
    if (atalho.startsWith(q)) return 1;
    if (normalized(r.titulo).includes(q)) return 2;
    if (normalized(r.texto).includes(q)) return 3;
    return 9;
  };
  return replies.map((r) => ({ r, s: score(r) })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s).map((x) => x.r);
}

export function cleanShortcut(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
}

/** Valida a mensagem antes de salvar. Devolve a lista de problemas (vazia = ok). */
export function validateReply(reply: Pick<QuickReply, 'id' | 'titulo' | 'texto' | 'atalho'>, all: QuickReply[]): string[] {
  const errors: string[] = [];
  if (!reply.titulo.trim()) errors.push('Dê um nome para a mensagem.');
  if (!reply.texto.trim()) errors.push('Escreva o texto da mensagem.');
  if (reply.texto.length > 1500) errors.push('O texto pode ter até 1.500 caracteres.');
  if (!reply.atalho) errors.push('Defina um atalho, ex.: /bomdia.');
  else if (all.some((r) => r.id !== reply.id && r.atalho === reply.atalho)) errors.push(`O atalho /${reply.atalho} já está em uso.`);
  return errors;
}

export function upsertReply(saved: SavedReplies, reply: QuickReply): SavedReplies {
  const itens = saved.itens.some((r) => r.id === reply.id) ? saved.itens.map((r) => (r.id === reply.id ? reply : r)) : [...saved.itens, reply];
  return { ...saved, itens, ocultas: saved.ocultas.filter((id) => id !== reply.id) };
}

export function removeReply(saved: SavedReplies, id: string): SavedReplies {
  const isDefault = DEFAULT_REPLIES.some((r) => r.id === id);
  return { itens: saved.itens.filter((r) => r.id !== id), ocultas: isDefault ? [...new Set([...saved.ocultas, id])] : saved.ocultas };
}

/** Volta uma mensagem padrão ao texto original. */
export function restoreDefault(saved: SavedReplies, id: string): SavedReplies {
  return { itens: saved.itens.filter((r) => r.id !== id), ocultas: saved.ocultas.filter((x) => x !== id) };
}
