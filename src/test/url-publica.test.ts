import { describe, expect, it } from 'vitest';
import { conferirWebhookWhatsApp, eventoLigado, urlPublicaApp, urlWebhookWhatsApp, URL_PUBLICA_PADRAO } from '@/lib/atendimento/url-publica';
import { avaliarSaude } from '@/lib/monitoramento/saude';

describe('endereço público do webhook do WhatsApp', () => {
  it('usa o endereço oficial (atendimento-legal-desk) quando PUBLIC_APP_URL falta, está vazia ou é inválida', () => {
    expect(URL_PUBLICA_PADRAO).toBe('https://atendimento-legal-desk.lovable.app');
    expect(urlPublicaApp(undefined)).toBe(URL_PUBLICA_PADRAO);
    expect(urlPublicaApp('')).toBe(URL_PUBLICA_PADRAO);
    expect(urlPublicaApp('   ')).toBe(URL_PUBLICA_PADRAO);
    expect(urlPublicaApp('http://inseguro.example')).toBe(URL_PUBLICA_PADRAO);
    expect(urlPublicaApp('https://app.example.com/')).toBe('https://app.example.com');
  });

  it('monta a URL com o segredo codificado', () => {
    expect(urlWebhookWhatsApp(URL_PUBLICA_PADRAO, 'a b&c')).toBe('https://atendimento-legal-desk.lovable.app/api/public/atendimento/whatsapp?s=a%20b%26c');
  });

  it('detecta webhook apontando para outro domínio (ex.: cslawyers, fora do ar desde 26/11) sem expor o segredo', () => {
    const r = conferirWebhookWhatsApp('https://cslawyers.lovable.app/api/public/atendimento/whatsapp?s=SEGREDO', URL_PUBLICA_PADRAO, 'SEGREDO');
    expect(r.correto).toBe(false);
    expect(r.host).toBe('cslawyers.lovable.app');
    expect(r.motivo).toContain('as mensagens não chegam ao sistema');
    expect(r.motivo).toContain('atendimento-legal-desk.lovable.app');
    expect(JSON.stringify(r)).not.toContain('SEGREDO');
  });

  it('aceita só host, caminho e segredo exatos', () => {
    const ok = urlWebhookWhatsApp(URL_PUBLICA_PADRAO, 'x1');
    expect(conferirWebhookWhatsApp(ok, URL_PUBLICA_PADRAO, 'x1')).toEqual({ correto: true, host: 'atendimento-legal-desk.lovable.app' });
    expect(conferirWebhookWhatsApp(ok, URL_PUBLICA_PADRAO, 'x2').correto).toBe(false);
    expect(conferirWebhookWhatsApp('https://atendimento-legal-desk.lovable.app/outra?s=x1', URL_PUBLICA_PADRAO, 'x1').correto).toBe(false);
    expect(conferirWebhookWhatsApp('http://atendimento-legal-desk.lovable.app/api/public/atendimento/whatsapp?s=x1', URL_PUBLICA_PADRAO, 'x1').correto).toBe(false);
    expect(conferirWebhookWhatsApp('', URL_PUBLICA_PADRAO, 'x1')).toMatchObject({ correto: false, host: null });
    // Segredo vazio nunca confere, mesmo que a URL também não tenha segredo.
    expect(conferirWebhookWhatsApp('https://atendimento-legal-desk.lovable.app/api/public/atendimento/whatsapp?s=', URL_PUBLICA_PADRAO, '').correto).toBe(false);
  });

  it('PUBLIC_APP_URL configurada vence o padrão (domínio próprio do escritório)', () => {
    const base = urlPublicaApp('https://app.cslawyers.com.br');
    expect(conferirWebhookWhatsApp(urlWebhookWhatsApp(base, 's1'), base, 's1').correto).toBe(true);
    expect(conferirWebhookWhatsApp(urlWebhookWhatsApp(URL_PUBLICA_PADRAO, 's1'), base, 's1').correto).toBe(false);
  });

  it('lê eventos do UltraMsg como booleano ou texto', () => {
    expect(eventoLigado('true')).toBe(true);
    expect(eventoLigado(true)).toBe(true);
    expect(eventoLigado('false')).toBe(false);
    expect(eventoLigado(undefined)).toBe(false);
  });

  it('painel de saúde mostra o motivo e gera alerta quando o recebimento está quebrado', () => {
    const base = { agora: Date.parse('2026-11-26T15:00:00Z'), backendOk: true, whatsapp: { configurado: true, status: 'authenticated' }, ia: { chaveOk: true, chamadasHoje: 0, limite: 100, bloqueadasHoje: 0 }, errosUltimas24h: 0, pendentes: 0, incertas: 0, agendaErros24h: 0 };
    const motivo = conferirWebhookWhatsApp('https://cslawyers.lovable.app/api/public/atendimento/whatsapp?s=x', URL_PUBLICA_PADRAO, 'x').motivo ?? '';
    const quebrado = avaliarSaude({ ...base, webhook: { correto: false, host: 'cslawyers.lovable.app', erro: motivo } });
    expect(quebrado.geral).toBe('falha');
    expect(quebrado.alertas.join(' ')).toContain('as mensagens não chegam ao sistema');
    const ok = avaliarSaude({ ...base, webhook: { correto: true, host: 'atendimento-legal-desk.lovable.app', alcancavel: true, eventos: { recebidas: true, criadas: true } } });
    expect(ok.servicos.find(s => s.nome === 'Webhook')?.detalhe).toBe('Recebimento em atendimento-legal-desk.lovable.app');
  });
});
