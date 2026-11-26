import type { Conversa, Mensagem } from '../mock-data';
export function ultimaMensagem(mensagens: Mensagem[]): Mensagem | undefined {
  let last: Mensagem | undefined; let time = -Infinity;
  // Envio da equipe que falhou não conta como resposta: a conversa continua aguardando.
  const conta = (m: Mensagem) => m.de !== 'sistema' && m.status !== 'simulada' && m.envio?.estado !== 'falhou';
  for (const m of mensagens) {
    if (!conta(m)) continue;
    const t = Date.parse(m.dataHora ?? '');
    if (Number.isFinite(t) && t >= time) { time = t; last = m; }
  }
  return last ?? mensagens.filter(conta).at(-1);
}
export function ordenarConversas(a: Conversa, b: Conversa) {
  const timestamp = (c: Conversa) => { const t = Date.parse(c.lastMessageAt ?? ultimaMensagem(c.mensagens)?.dataHora ?? ''); return Number.isFinite(t) ? t : -Infinity; };
  const ta = timestamp(a), tb = timestamp(b);
  return ta === tb ? b.id.localeCompare(a.id) : ta > tb ? -1 : 1;
}
export function previaMensagem(m: Mensagem | undefined, userId?: string) {
  if (!m) return 'Sem mensagens';
  if (m.apagadaParaTodos || userId && m.ocultaPara?.includes(userId)) return 'Mensagem apagada';
  const media = m.tipo === 'audio' ? '[áudio]' : m.tipo === 'imagem' ? '[imagem]' : m.tipo === 'video' ? '[vídeo]' : m.tipo === 'documento' || m.arquivo ? '[documento]' : '';
  const autor = m.de === 'cliente' ? 'Cliente' : /ana|ia|assistente/i.test(m.autor ?? '') ? 'ANA' : 'Equipe';
  const texto = media && /^\[(?:audio|áudio|imagem|documento|arquivo|video|vídeo)/i.test(m.texto) ? '' : m.texto;
  return `${autor}: ${media}${media && texto ? ' ' : ''}${texto || (!media ? m.arquivo ?? '' : '')}`;
}
export function timestampWhatsAppReal(valor: unknown, agora = new Date()): string | undefined {
  const n = typeof valor === 'number' || typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
  const t = Number.isFinite(n) ? n < 1e12 ? n * 1000 : n : typeof valor === 'string' ? Date.parse(valor) : NaN;
  return Number.isFinite(t) && t > 0 && t <= agora.getTime() + 60000 ? new Date(t).toISOString() : undefined;
}
export function timestampWhatsApp(valor: unknown, agora = new Date()): string {
  return timestampWhatsAppReal(valor, agora) ?? agora.toISOString();
}
export function ultimaRecebida(c: Pick<Conversa, 'mensagens'>) {
  return c.mensagens.filter(m => m.de === 'cliente' && Number.isFinite(Date.parse(m.dataHora ?? ''))).map(m => m.dataHora ?? '').sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}