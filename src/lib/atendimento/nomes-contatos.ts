import { normalizarTelefone } from './telefone';

export interface NomeContatoWhatsApp { telefone: string; agenda?: string; perfil?: string; interno?: string }
export interface AgendaWhatsApp { contatos: Record<string, NomeContatoWhatsApp>; sincronizadoEm: string; ambiguos: number }
export interface ContatoUltraNome { id?: string; number?: string; name?: string; pushname?: string; isMyContact?: boolean; isGroup?: boolean; isMe?: boolean }
export const limparNomeContato = (s: string | undefined) => (s ?? '').replace(/\p{Cc}/gu, '').trim().slice(0, 200);
/** Country is retained: a foreign number must never collide with a Brazilian DDD. */
export function chaveNomeContato(s: string) {
  const valor = s.replace(/@.*$/, '');
  const n = normalizarTelefone(valor);
  return /^\d{12,13}$/.test(n) && n.startsWith('55') ? `55${n.slice(2,4)}${n.slice(-8)}` : /^\d{8,15}$/.test(n) ? n : '';
}
export function indexarNomesContatos(lista: ContatoUltraNome[]) {
  const contatos: Record<string, NomeContatoWhatsApp> = {};
  const ambiguos = new Set<string>();
  for (const c of lista) {
    if (c.isGroup || c.isMe || !c.id?.endsWith('@c.us')) continue;
    const chave = chaveNomeContato(c.id);
    if (!chave || c.number && chaveNomeContato(c.number) !== chave || ambiguos.has(chave)) continue;
    const agenda = c.isMyContact === true ? limparNomeContato(c.name) : '';
    const perfil = limparNomeContato(c.pushname);
    const anterior = contatos[chave];
    if (anterior?.agenda && agenda && anterior.agenda !== agenda) { delete contatos[chave]; ambiguos.add(chave); continue; }
    contatos[chave] = { telefone: normalizarTelefone(c.id.replace(/@.*$/, '')), ...(anterior?.agenda || agenda ? { agenda: anterior?.agenda || agenda } : {}), ...(perfil || anterior?.perfil ? { perfil: perfil || anterior?.perfil } : {}) };
  }
  return { contatos, ambiguos };
}
/** Explicit internal names (including the reviewed ProJuris label) are intentional aliases. */
export function nomeContatoExibido(c: { nome: string; telefone: string; nomePerfilWhatsApp?: string | undefined }, contato?: NomeContatoWhatsApp, nomeProjuris?: string) {
  return limparNomeContato(contato?.interno) || limparNomeContato(contato?.agenda) || limparNomeContato(nomeProjuris) || limparNomeContato(contato?.perfil) || limparNomeContato(c.nomePerfilWhatsApp) || limparNomeContato(c.nome) || c.telefone;
}
export function mesclarNomesAgenda(anterior: AgendaWhatsApp | undefined, novos: Record<string, NomeContatoWhatsApp>, em: string, ambiguos: number): AgendaWhatsApp {
  const contatos = { ...anterior?.contatos };
  for (const [chave, contato] of Object.entries(novos)) {
    const antigo = contatos[chave];
    contatos[chave] = { ...antigo, ...contato, ...(antigo?.agenda && !contato.agenda ? { agenda: antigo.agenda } : {}), ...(antigo?.interno ? { interno: antigo.interno } : {}) };
  }
  return { contatos, sincronizadoEm: em, ambiguos };
}