/**
 * Endereço público do app publicado, base do webhook do WhatsApp (UltraMsg).
 * Endereço oficial escolhido pelo escritório em 26/11/2026: `atendimento-legal-desk.lovable.app`
 * (`cslawyers.lovable.app` ficou fora do ar na tarde de 26/11). Configure `PUBLIC_APP_URL` nos segredos do Lovable
 * com o endereço oficial: ele sempre tem prioridade sobre este padrão.
 */
export const URL_PUBLICA_PADRAO = 'https://atendimento-legal-desk.lovable.app';
export const CAMINHO_WEBHOOK_WHATSAPP = '/api/public/atendimento/whatsapp';

/** Valor vazio, sem https ou com barra final nunca vira base de webhook. */
export function urlPublicaApp(configurada: string | undefined): string {
  const v = (configurada ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/?#\s]+$/i.test(v)) return URL_PUBLICA_PADRAO;
  return v;
}

export function urlWebhookWhatsApp(base: string, segredo: string) {
  return `${base}${CAMINHO_WEBHOOK_WHATSAPP}?s=${encodeURIComponent(segredo)}`;
}

export interface ConferenciaWebhook {
  correto: boolean;
  /** Host para onde o UltraMsg envia hoje (nunca inclui o segredo). */
  host: string | null;
  motivo?: string;
}

/**
 * Confere o webhook registrado no UltraMsg contra o app publicado, sem expor o segredo.
 * Qualquer host diferente do app publicado é erro: o domínio do projeto já mudou mais de uma vez.
 */
export function conferirWebhookWhatsApp(registrada: string, base: string, segredo: string): ConferenciaWebhook {
  let url: URL;
  try { url = new URL(registrada.trim()); } catch { return { correto: false, host: null, motivo: 'Nenhum endereço de recebimento registrado no UltraMsg' }; }
  const esperado = new URL(base);
  const host = url.host;
  if (url.protocol !== 'https:' || host.toLowerCase() !== esperado.host.toLowerCase()) return { correto: false, host, motivo: `Recebimento aponta para ${host}, mas o app publicado é ${esperado.host}: as mensagens não chegam ao sistema` };
  if (url.pathname.replace(/\/+$/, '') !== CAMINHO_WEBHOOK_WHATSAPP) return { correto: false, host, motivo: 'Caminho do recebimento diferente da rota do WhatsApp' };
  if (!segredo || url.searchParams.get('s') !== segredo) return { correto: false, host, motivo: 'Segredo do recebimento diferente do configurado' };
  return { correto: true, host };
}

/** Configuração lida do UltraMsg: eventos chegam como booleano ou texto. */
export function eventoLigado(v: unknown) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
}
