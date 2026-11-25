import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { conversas, type Conversa } from '@/lib/mock-data';
import { nextStep, validReturn } from '@/lib/atendimento';
import { DURACAO_RETORNO } from '@/lib/atendimento/schedule-rules';
import { enviarArquivoUltramsg } from '@/lib/atendimento/canais/ultramsg';
import { linkMeetDaReserva, motivoIndisponivel } from '@/components/office/attendance-actions';
import { ChatMessages } from '@/components/office/chat-messages';
import { n8n } from '@/services/integracoes';

// Dados fictícios.
const fixture = conversas[1];
if (!fixture) throw new Error('fixture');
const { consulta: _consulta, contrato: _contrato, contratoLink: _link, ...semContrato } = fixture;
const base: Conversa = { ...semContrato, timeline: [] };
const cred = { instancia: 'inst-teste', token: 'token-teste' };

afterEach(() => { vi.unstubAllGlobals(); });

describe('P0-2 · nenhuma ação do Atendimento finge que executou', () => {
  it('sem stubs de contrato/cobrança/agenda/Meet/anexo simulados no Atendimento', () => {
    for (const nome of ['gerarContrato', 'gerarCobranca', 'agendarRetorno', 'criarPastaCliente', 'agendarConsulta', 'obterHorariosLivres', 'iniciarVideochamada', 'enviarAnexo']) expect(nome in n8n).toBe(false);
  });
  it('Trato feito sem ZapSign: contrato continua pendente e o próximo passo é enviar o link real', () => {
    const c = { ...base, etapa: 'documentos' as const, timeline: [{ data: '2026-11-25T12:00:00Z', evento: 'Trato feito · pasta X · contrato pendente' }] };
    expect(c.contrato).toBeUndefined();
    expect(c.contratoLink).toBeUndefined();
    expect(nextStep(c)).toMatchObject({ title: 'Enviar contrato', action: 'contrato' });
  });
  it('videochamada só com link HTTPS do recibo da consulta atual; sem link, o botão diz por quê', () => {
    const inicio = '2026-11-26T17:00:00.000Z';
    const comMeet = { ...base, consultaAgendada: inicio, agenteAna: { reservaCalendar: { id: 'pj:1', inicio, fim: '2026-11-26T17:30:00.000Z', meetUrl: 'https://meet.google.com/abc-defg-hij' } } };
    expect(linkMeetDaReserva(comMeet)).toBe('https://meet.google.com/abc-defg-hij');
    expect(motivoIndisponivel(comMeet, 'video')).toBeUndefined();
    const semMeet = { ...comMeet, agenteAna: { reservaCalendar: { id: 'pj:1', inicio, fim: '2026-11-26T17:30:00.000Z' } } };
    expect(linkMeetDaReserva(semMeet)).toBeUndefined();
    expect(motivoIndisponivel(semMeet, 'video')).toMatch(/Sem link do Meet/);
    const outroHorario = { ...comMeet, consultaAgendada: '2026-11-27T17:00:00.000Z' };
    expect(linkMeetDaReserva(outroHorario)).toBeUndefined();
    expect(linkMeetDaReserva({ ...comMeet, agenteAna: { reservaCalendar: { id: 'pj:1', inicio, fim: inicio, meetUrl: 'http://meet.google.com/x' } } })).toBeUndefined();
  });
  it('cobrança mostra "não configurado" em vez de gerar link', () => {
    expect(motivoIndisponivel(base, 'cobranca')).toMatch(/não configurado/);
  });
  it('retorno de cliente da casa usa DURACAO_RETORNO = 30 (D2)', () => {
    expect(DURACAO_RETORNO).toBe(30);
    expect(validReturn('2026-11-27T14:00:00-03:00', DURACAO_RETORNO)).toBe(true);
    expect(validReturn('2026-11-27T14:00:00-03:00', 20)).toBe(false);
  });
});

describe('P0-2 · anexo da equipe', () => {
  it('anexo sem recibo aparece como "Guardado (não enviado ao cliente)"', () => {
    const c = { ...base, mensagens: [{ id: 'a1', de: 'escritorio' as const, texto: '', hora: '10:00', arquivo: 'contrato.pdf', tipo: 'documento' as const, path: 'u/c/1/contrato.pdf' }] };
    render(createElement(ChatMessages, { c, onEnviarAnexo: () => undefined }));
    expect(screen.getByText('Guardado (não enviado ao cliente)')).toBeTruthy();
    expect(screen.getByText('Enviar ao cliente')).toBeTruthy();
  });
  it('anexo com recibo não mostra o aviso de guardado', () => {
    const c = { ...base, mensagens: [{ id: 'a2', de: 'escritorio' as const, texto: '', hora: '10:00', arquivo: 'contrato.pdf', tipo: 'documento' as const, path: 'u/c/1/contrato.pdf', status: 'enviada' as const, idExterno: '77' }] };
    render(createElement(ChatMessages, { c }));
    expect(screen.queryByText('Guardado (não enviado ao cliente)')).toBeNull();
  });
  it('UltraMsg: documento vai para /messages/document com filename e URL assinada; recibo só com sent=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sent: 'true', id: 991 }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await enviarArquivoUltramsg('5511900000001', { tipo: 'documento', url: 'https://storage.exemplo/assinada?token=x', nome: 'contrato.pdf', legenda: 'Segue o contrato' }, cred, true);
    expect(r).toEqual({ ok: true, idExterno: '991' });
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://api.ultramsg.com/inst-teste/messages/document');
    const body = new URLSearchParams(init.body);
    expect(body.get('filename')).toBe('contrato.pdf');
    expect(body.get('document')).toBe('https://storage.exemplo/assinada?token=x');
    expect(body.get('caption')).toBe('Segue o contrato');
  });
  it('UltraMsg: imagem vai para /messages/image', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sent: true, id: 'x1' }) });
    vi.stubGlobal('fetch', fetchMock);
    await enviarArquivoUltramsg('5511900000001', { tipo: 'imagem', url: 'https://storage.exemplo/foto', nome: 'foto.jpg' }, cred, true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.ultramsg.com/inst-teste/messages/image');
  });
  it('UltraMsg: sem "sent", URL não HTTPS, número não autorizado ou sem credencial = não enviado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: 'x' }) }));
    expect((await enviarArquivoUltramsg('5511900000001', { tipo: 'documento', url: 'https://s/a', nome: 'a.pdf' }, cred, true)).ok).toBe(false);
    expect((await enviarArquivoUltramsg('5511900000001', { tipo: 'documento', url: 'http://s/a', nome: 'a.pdf' }, cred, true)).ok).toBe(false);
    expect((await enviarArquivoUltramsg('5511900000001', { tipo: 'documento', url: 'https://s/a', nome: 'a.pdf' }, cred, false)).ok).toBe(false);
    expect((await enviarArquivoUltramsg('5511900000001', { tipo: 'documento', url: 'https://s/a', nome: 'a.pdf' }, { instancia: '', token: '' }, true)).ok).toBe(false);
    expect((await enviarArquivoUltramsg('120363000000000000@g.us', { tipo: 'documento', url: 'https://s/a', nome: 'a.pdf' }, cred, true)).ok).toBe(false);
  });
});
