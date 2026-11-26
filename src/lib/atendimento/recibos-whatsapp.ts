// Recibos do WhatsApp (UltraMsg) aplicados às mensagens do escritório, sem depender de campos não documentados:
// o eco `message_create` do próprio número traz o id da mensagem no WhatsApp (`data.id`), guardado na mensagem que
// o sistema acabou de registrar; os eventos `message_ack` usam esse mesmo id. O formato do ack não está na
// documentação oficial (conferida em 26/11/2026), por isso aceita texto ou número e ignora o resto.
import type { Conversa, Mensagem } from '../mock-data';
import { avancarStatus } from '../atendimento';

const normalizar = (t: string) => t.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

export type StatusRecibo = 'enviada' | 'entregue' | 'lida';

export function statusDoAck(ack: unknown): StatusRecibo | undefined {
  const v = typeof ack === 'string' ? ack.trim().toLowerCase() : ack;
  if (v === 'server' || v === 'sent' || v === 1 || v === '1') return 'enviada';
  if (v === 'device' || v === 'delivered' || v === 'received' || v === 2 || v === '2') return 'entregue';
  if (v === 'read' || v === 'played' || v === 'viewed' || v === 3 || v === 4 || v === '3' || v === '4') return 'lida';
  return undefined;
}

/**
 * Eco reconhecido como envio do sistema: grava o id do WhatsApp na mensagem do escritório mais recente com o mesmo
 * texto (últimos 30 min, ainda sem id). Devolve undefined quando não há o que mudar.
 */
export function vincularEco(c: Conversa, texto: string, idWhatsApp: string, agora = new Date()): Conversa | undefined {
  if (!idWhatsApp || c.mensagens.some(m => m.idWhatsApp === idWhatsApp || m.idExterno === idWhatsApp)) return undefined;
  const corpo = normalizar(texto);
  if (!corpo) return undefined;
  const limite = agora.getTime() - 30 * 60000;
  let alvo = -1, melhor = -Infinity;
  c.mensagens.forEach((m, i) => {
    if (m.de !== 'escritorio' || m.idWhatsApp || m.status === 'simulada' || m.envio?.estado === 'falhou') return;
    const t = Date.parse(m.dataHora ?? '');
    if (Number.isFinite(t) && t < limite) return;
    const n = normalizar(m.texto);
    // O UltraMsg pode acrescentar horários ao final do texto (textoComOpcoes): o início também vale.
    if (!n || !(corpo === n || corpo.startsWith(n))) return;
    const chave = Number.isFinite(t) ? t : i;
    if (chave >= melhor) { melhor = chave; alvo = i; }
  });
  if (alvo < 0) return undefined;
  return { ...c, mensagens: c.mensagens.map((m, i) => i === alvo ? { ...m, idWhatsApp } : m) };
}

/** Aplica o recibo sem voltar atrás (lida não volta a entregue) e nunca promove mensagem simulada ou sem envio. */
export function aplicarAck(c: Conversa, idWhatsApp: string, status: StatusRecibo): Conversa | undefined {
  if (!idWhatsApp) return undefined;
  const i = c.mensagens.findIndex(m => m.idWhatsApp === idWhatsApp || (m.canal === 'ultramsg' && m.idExterno === idWhatsApp));
  const m: Mensagem | undefined = c.mensagens[i];
  if (!m || m.de !== 'escritorio' || !m.status || m.status === 'simulada') return undefined;
  const novo = avancarStatus(m.status, status);
  if (novo === m.status) return undefined;
  return { ...c, mensagens: c.mensagens.map((x, j) => j === i ? { ...x, status: novo } : x) };
}
