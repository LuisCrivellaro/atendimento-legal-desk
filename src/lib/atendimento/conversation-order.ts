import type { Conversa, Mensagem } from '../mock-data';
export function ultimaMensagem(mensagens: Mensagem[]): Mensagem | undefined {
  let last: Mensagem | undefined; let time = -Infinity;
  for (const m of mensagens) {
    if (m.de === 'sistema' || m.status === 'simulada') continue;
    const t = Date.parse(m.dataHora ?? '');
    if (Number.isFinite(t) && t >= time) { time = t; last = m; }
  }
  return last ?? mensagens.filter(m => m.de !== 'sistema' && m.status !== 'simulada').at(-1);
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
  return `${autor}: ${media}${media && m.texto ? ' ' : ''}${m.texto || (!media ? m.arquivo ?? '' : '')}`;
}
export function timestampWhatsApp(valor: unknown, agora = new Date()): string {
  const n = typeof valor === 'number' || typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
  const t = Number.isFinite(n) ? n < 1e12 ? n * 1000 : n : typeof valor === 'string' ? Date.parse(valor) : NaN;
  return Number.isFinite(t) && t > 0 && t <= agora.getTime() + 60000 ? new Date(t).toISOString() : agora.toISOString();
}
export function ultimaRecebida(c: Pick<Conversa, 'mensagens'>) {
  return c.mensagens.filter(m => m.de === 'cliente' && Number.isFinite(Date.parse(m.dataHora ?? ''))).map(m => m.dataHora ?? '').sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}