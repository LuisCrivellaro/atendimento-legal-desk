// Fila de envio da equipe no navegador: a mensagem aparece na hora (otimista), sai em ordem por conversa sem travar
// o campo de texto e continua mesmo se a equipe trocar de conversa. O servidor decide a idempotência pelo id.
import { useMemo, useSyncExternalStore } from 'react';
import type { MensagemPendente } from './sincronizacao';

export type ResultadoEnvioEquipe =
  | { ok: true; mensagem?: unknown }
  | { ok: false; erro: string; ambiguo: boolean };

type Executor = (p: MensagemPendente, reenvioConferido: boolean) => Promise<ResultadoEnvioEquipe>;

const pendentes = new Map<string, MensagemPendente>();
let instantaneo: MensagemPendente[] = [];
const ouvintes = new Set<() => void>();
const filas = new Map<string, Promise<void>>();

function emitir() { instantaneo = [...pendentes.values()]; for (const f of ouvintes) f(); }
function mudar(id: string, patch: Partial<MensagemPendente>) { const p = pendentes.get(id); if (!p) return; pendentes.set(id, { ...p, ...patch }); emitir(); }
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const ler = () => instantaneo;

export function usePendentes(conversaId: string) {
  const todos = useSyncExternalStore(assinar, ler, ler);
  return useMemo(() => todos.filter(p => p.conversaId === conversaId), [todos, conversaId]);
}

export function pendentesAtuais() { return instantaneo; }

/**
 * Remove da fila local as falhas que o servidor já registrou (a versão do servidor passa a valer). Pendente na fila
 * ou enviando nunca sai por aqui: é uma nova tentativa em curso e só a própria resposta a encerra.
 */
export function resolverPendentes(ids: readonly string[]) {
  let mudou = false;
  for (const id of ids) { const p = pendentes.get(id); if (p && p.estado === 'falhou') mudou = pendentes.delete(id) || mudou; }
  if (mudou) emitir();
}

async function processar(id: string, executar: Executor, conferido: boolean, aoConcluir?: (p: MensagemPendente) => void) {
  const p = pendentes.get(id);
  if (!p) return;
  mudar(id, { estado: 'enviando', erro: undefined, ambiguo: undefined });
  try {
    const r = await executar(p, conferido);
    if (r.ok) { pendentes.delete(id); emitir(); aoConcluir?.(p); return; }
    mudar(id, { estado: 'falhou', erro: r.erro, ambiguo: r.ambiguo });
  } catch {
    // Sem resposta do servidor: a nova tentativa com o mesmo id é segura (o servidor não duplica).
    mudar(id, { estado: 'falhou', erro: 'Sem resposta do servidor. Tente de novo.', ambiguo: false });
  }
}

function encadear(conversaId: string, tarefa: () => Promise<void>) {
  const anterior = filas.get(conversaId) ?? Promise.resolve();
  const proxima = anterior.then(tarefa, tarefa);
  filas.set(conversaId, proxima);
  void proxima.finally(() => { if (filas.get(conversaId) === proxima) filas.delete(conversaId); });
}

/** Mostra a mensagem imediatamente e a envia depois das anteriores desta conversa. Devolve o id (gerado aqui). */
export function enfileirarEnvio(dados: { conversaId: string; texto: string; autor: string }, executar: Executor, aoConcluir?: (p: MensagemPendente) => void, agora = new Date()) {
  const id = crypto.randomUUID();
  pendentes.set(id, { id, conversaId: dados.conversaId, texto: dados.texto, autor: dados.autor, criadaEm: agora.toISOString(), estado: 'fila' });
  emitir();
  encadear(dados.conversaId, () => processar(id, executar, false, aoConcluir));
  return id;
}

/** Nova tentativa com o MESMO id (o servidor devolve a já enviada em vez de mandar de novo). */
export function reenviarMensagem(m: { id: string; conversaId: string; texto: string; autor: string }, executar: Executor, conferido: boolean, aoConcluir?: (p: MensagemPendente) => void) {
  const atual = pendentes.get(m.id);
  if (atual?.estado === 'enviando' || atual?.estado === 'fila') return;
  pendentes.set(m.id, { id: m.id, conversaId: m.conversaId, texto: m.texto, autor: m.autor, criadaEm: atual?.criadaEm ?? new Date().toISOString(), estado: 'fila' });
  emitir();
  encadear(m.conversaId, () => processar(m.id, executar, conferido, aoConcluir));
}

/** Só para testes. */
export function limparFilaEnvio() { pendentes.clear(); filas.clear(); emitir(); }
