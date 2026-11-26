// Regras puras de sincronização da lista de conversas no navegador (sem rede): aplicam no cache só a conversa que
// mudou, preservando a referência das demais para que a tela não redesenhe tudo a cada mensagem.
import type { Conversa, Mensagem } from '../mock-data';
import { ordenarConversas, ultimaMensagem } from './conversation-order';

/**
 * Painel e notificações só precisam do fim da conversa (o "aguardando resposta" olha a última mensagem): manda as
 * últimas `limite` e garante a última por horário real, para o contador dar o mesmo resultado da conversa inteira.
 */
export function mensagensRecentes(mensagens: readonly Mensagem[], limite = 30): Mensagem[] {
  if (mensagens.length <= limite) return mensagens as Mensagem[];
  const fim = mensagens.slice(-limite);
  const ultima = ultimaMensagem(mensagens as Mensagem[]);
  return ultima && !fim.includes(ultima) ? [...fim, ultima] : fim;
}

/** Insere ou substitui uma conversa mantendo a ordem da lista; devolve a mesma lista quando nada mudou. */
export function aplicarCaso(lista: readonly Conversa[], caso: Conversa): Conversa[] {
  const i = lista.findIndex(c => c.id === caso.id);
  if (i >= 0 && mesmaConversa(lista[i]!, caso)) return lista as Conversa[];
  const sem = i >= 0 ? [...lista.slice(0, i), ...lista.slice(i + 1)] : [...lista];
  // Busca binária pela posição (lista já ordenada por ordenarConversas).
  let lo = 0, hi = sem.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ordenarConversas(sem[mid]!, caso) <= 0) lo = mid + 1; else hi = mid; }
  sem.splice(lo, 0, caso);
  return sem;
}

export function aplicarCasos(lista: readonly Conversa[], casos: readonly Conversa[]): Conversa[] {
  let atual = lista as Conversa[];
  for (const c of casos) atual = aplicarCaso(atual, c);
  return atual;
}

export function removerCaso(lista: readonly Conversa[], id: string): Conversa[] {
  const i = lista.findIndex(c => c.id === id);
  return i < 0 ? lista as Conversa[] : [...lista.slice(0, i), ...lista.slice(i + 1)];
}

/** Comparação barata antes da profunda: mesma quantidade e mesma última mensagem raramente diferem no resto. */
function mesmaConversa(a: Conversa, b: Conversa) {
  if (a === b) return true;
  if (a.mensagens.length !== b.mensagens.length || a.lastMessageAt !== b.lastMessageAt || a.etapa !== b.etapa || a.nome !== b.nome) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Mensagem que a equipe acabou de digitar e ainda não voltou do servidor (exibição otimista). */
export interface MensagemPendente {
  id: string;
  conversaId: string;
  texto: string;
  autor: string;
  criadaEm: string;
  estado: 'fila' | 'enviando' | 'falhou';
  erro?: string | undefined;
  /** Falha depois de chamar o provedor: pode ter chegado ao cliente; reenviar exige conferência. */
  ambiguo?: boolean | undefined;
}

/**
 * Conversa exibida = mensagens do servidor + pendentes ainda não gravadas (mesmo id nunca aparece duas vezes).
 * Quando o servidor já tem a mensagem, vale a versão do servidor (status real do canal).
 */
export function comPendentes(c: Conversa, pendentes: readonly MensagemPendente[]): Conversa {
  if (!pendentes.length) return c;
  const ids = new Set(c.mensagens.map(m => m.id));
  const extras = pendentes.filter(p => p.conversaId === c.id && !ids.has(p.id)).map(pendenteParaMensagem);
  return extras.length ? { ...c, mensagens: [...c.mensagens, ...extras] } : c;
}

export function pendenteParaMensagem(p: MensagemPendente): Mensagem {
  const d = new Date(p.criadaEm);
  return {
    id: p.id, de: 'escritorio', texto: p.texto, autor: p.autor, dataHora: p.criadaEm,
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
    envio: { estado: p.estado === 'falhou' ? 'falhou' : 'enviando', reservadoEm: p.criadaEm, ...(p.erro ? { erro: p.erro } : {}), ...(p.ambiguo ? { ambiguo: true } : {}) },
  };
}

/** Pendentes que o servidor já confirmou (mensagem presente com recibo ou falha registrada) saem da fila local. */
export function pendentesResolvidos(c: Conversa, pendentes: readonly MensagemPendente[]) {
  const porId = new Map(c.mensagens.map(m => [m.id, m]));
  return pendentes.filter(p => {
    if (p.conversaId !== c.id) return false;
    const m = porId.get(p.id);
    return !!m && (!!m.status || m.envio?.estado === 'falhou');
  }).map(p => p.id);
}
