import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  configPadrao, decidirEnvio, validarTextoEnvio, podeGerenciarCanal,
  sanitizarConfig, mascararContato, etiquetaAcao, type CanalConfig,
} from '@/lib/atendimento/canal-envio';
import { enviarTextoTelegram } from '@/lib/atendimento/canais/telegram';

const telegram: CanalConfig = { ...configPadrao, canal_ativo: 'telegram' };
const liberado = { status: 'liberado' as const };

describe('decisão de envio', () => {
  it('canal desligado não faz chamada externa (simulado)', () => {
    expect(decidirEnvio(configPadrao, null)).toEqual({ permitido: true, simulado: true });
  });
  it('contato não liberado é recusado com a mensagem do modo teste', () => {
    expect(decidirEnvio(telegram, null).motivo).toBe('Modo teste: contato não liberado. Nada foi enviado.');
    expect(decidirEnvio(telegram, { status: 'aguardando_liberacao' }).permitido).toBe(false);
    expect(decidirEnvio(telegram, { status: 'bloqueado' }).permitido).toBe(false);
    expect(decidirEnvio(telegram, liberado)).toEqual({ permitido: true, simulado: false });
  });
  it('ultramsg fica indisponível nesta fase', () => {
    expect(decidirEnvio({ ...configPadrao, canal_ativo: 'ultramsg' }, liberado).permitido).toBe(false);
  });
});

describe('validação do texto no servidor', () => {
  it('bloqueia texto vazio', () => {
    expect(validarTextoEnvio('   ')).toBe('A mensagem está vazia.');
  });
  it('bloqueia campos {entre_chaves} não preenchidos', () => {
    expect(validarTextoEnvio('Olá, sua consulta é {data}')).toBe('Preencha todos os campos entre chaves antes de enviar.');
  });
  it('bloqueia "Link não registrado" em qualquer forma', () => {
    expect(validarTextoEnvio('link NÃO registrado')).toBe('Registre o link do contrato antes de enviar.');
  });
  it('aceita mensagem pronta', () => {
    expect(validarTextoEnvio('Olá, tudo bem?')).toBeNull();
  });
});

describe('permissões e configuração', () => {
  it('perfil sem permissão não altera a configuração', () => {
    expect(podeGerenciarCanal(['atendente'])).toBe(false);
    expect(podeGerenciarCanal(['operacoes'])).toBe(false);
    expect(podeGerenciarCanal(['advogada_senior'])).toBe(true);
    expect(podeGerenciarCanal(['admin'])).toBe(true);
  });
  it('agente sempre desligado e modo teste sempre ligado com Telegram', () => {
    const c = sanitizarConfig({ canal_ativo: 'telegram', modo_teste: false, agente_ativo: true, fonte_sugestoes: 'agente' });
    expect(c).toEqual({ canal_ativo: 'telegram', modo_teste: true, agente_ativo: false, fonte_sugestoes: 'agente' });
    expect(sanitizarConfig({ canal_ativo: 'ultramsg' }).canal_ativo).toBe('desligado');
  });
  it('etiquetas das ações: real só com Telegram nas ações de mensagem', () => {
    expect(etiquetaAcao('enviarMensagem', telegram)).toBe('Real (Telegram)');
    expect(etiquetaAcao('gerarCobranca', telegram)).toBe('Simulado');
    expect(etiquetaAcao('enviarMensagem', configPadrao)).toBe('Simulado');
  });
  it('mascara o chat_id', () => {
    expect(mascararContato('123456789')).toBe('••••6789');
  });
});

describe('adaptador Telegram', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sucesso só com ok:true e guarda o message_id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 })));
    const r = await enviarTextoTelegram('123456', 'olá', 'token-secreto');
    expect(r).toEqual({ ok: true, idExterno: '42' });
  });
  it('o token nunca aparece nas mensagens de erro', async () => {
    const token = '999:TOKEN-SUPER-SECRETO';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, description: `Bad Request: token ${token} inválido` }), { status: 400 })));
    const erro = await enviarTextoTelegram('123456', 'olá', token);
    expect(erro.ok).toBe(false);
    expect(erro.erro).not.toContain(token);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`network failed for ${token}`)));
    const falha = await enviarTextoTelegram('123456', 'olá', token);
    expect(falha.ok).toBe(false);
    expect(falha.erro).not.toContain(token);
  });
  it('falha no envio devolve ok:false (quem chama não grava a mensagem)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    // ok:true sem message_id ainda é sucesso; HTTP 200 com ok:false não é.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 200 })));
    const r = await enviarTextoTelegram('123456', 'olá', 'token');
    expect(r.ok).toBe(false);
  });
});
