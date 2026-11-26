import { describe, expect, it } from 'vitest';
import { aplicarAck, statusDoAck, vincularEco } from '@/lib/atendimento/recibos-whatsapp';
import type { Conversa, Mensagem } from '@/lib/mock-data';

const agora = new Date('2026-11-26T15:00:00Z');
const conversa = (mensagens: Mensagem[]): Conversa => ({ id: 'c', nome: 'C', cpf: '', telefone: '', atendimento: '', etapa: 'inicial', naoLidas: 0, etapaPipeline: 0, syncs: [], processos: [], documentos: [], timeline: [], mensagens });
const m = (id: string, extra: Partial<Mensagem>): Mensagem => ({ id, de: 'escritorio', texto: 'Bom dia', hora: '', dataHora: '2026-11-26T14:59:00Z', ...extra });

describe('recibos do WhatsApp', () => {
  it('ack em texto ou número vira status do Manager; desconhecido é ignorado', () => {
    expect(statusDoAck('server')).toBe('enviada');
    expect(statusDoAck('device')).toBe('entregue');
    expect(statusDoAck(2)).toBe('entregue');
    expect(statusDoAck('READ')).toBe('lida');
    expect(statusDoAck('played')).toBe('lida');
    expect(statusDoAck('pending')).toBeUndefined();
    expect(statusDoAck(-1)).toBeUndefined();
    expect(statusDoAck(undefined)).toBeUndefined();
  });

  it('eco liga o id do WhatsApp à mensagem mais recente com o mesmo texto, uma vez só', () => {
    const c = conversa([m('a', { dataHora: '2026-11-26T14:40:00Z', status: 'enviada' }), m('b', { envio: { estado: 'enviando', reservadoEm: '2026-11-26T14:59:00Z' } }), { ...m('cli', {}), de: 'cliente' }]);
    const v = vincularEco(c, 'Bom dia', 'wa9', agora)!;
    expect(v.mensagens.find(x => x.id === 'b')?.idWhatsApp).toBe('wa9');
    expect(v.mensagens.find(x => x.id === 'a')?.idWhatsApp).toBeUndefined();
    expect(vincularEco(v, 'Bom dia', 'wa9', agora)).toBeUndefined();
    // O próximo eco igual vai para a outra mensagem ainda sem id.
    expect(vincularEco(v, 'Bom dia', 'wa10', agora)?.mensagens.find(x => x.id === 'a')?.idWhatsApp).toBe('wa10');
  });

  it('eco não liga a mensagem antiga, simulada, com falha ou de texto diferente', () => {
    expect(vincularEco(conversa([m('a', { dataHora: '2026-11-26T13:00:00Z' })]), 'Bom dia', 'w', agora)).toBeUndefined();
    expect(vincularEco(conversa([m('a', { status: 'simulada' })]), 'Bom dia', 'w', agora)).toBeUndefined();
    expect(vincularEco(conversa([m('a', { envio: { estado: 'falhou', reservadoEm: '2026-11-26T14:59:00Z' } })]), 'Bom dia', 'w', agora)).toBeUndefined();
    expect(vincularEco(conversa([m('a', {})]), 'Boa tarde', 'w', agora)).toBeUndefined();
    // Horários acrescentados pelo UltraMsg ao final ainda reconhecem a mensagem.
    expect(vincularEco(conversa([m('a', {})]), 'Bom dia\n\n• Qua, 27/11 às 9h', 'w', agora)?.mensagens[0]?.idWhatsApp).toBe('w');
  });

  it('ack só avança, nunca promove simulada nem mensagem sem envio confirmado', () => {
    const c = conversa([m('a', { status: 'enviada', idWhatsApp: 'w1' }), m('b', { status: 'simulada', idWhatsApp: 'w2' }), m('c', { idWhatsApp: 'w3', envio: { estado: 'enviando', reservadoEm: 'x' } }), m('d', { status: 'enviada', canal: 'ultramsg', idExterno: 'w4' })]);
    const lida = aplicarAck(c, 'w1', 'lida')!;
    expect(lida.mensagens[0]?.status).toBe('lida');
    expect(aplicarAck(lida, 'w1', 'entregue')).toBeUndefined();
    expect(aplicarAck(c, 'w2', 'lida')).toBeUndefined();
    expect(aplicarAck(c, 'w3', 'lida')).toBeUndefined();
    // Resposta registrada pelo celular do escritório guarda o id do WhatsApp em idExterno.
    expect(aplicarAck(c, 'w4', 'entregue')?.mensagens[3]?.status).toBe('entregue');
    expect(aplicarAck(c, 'nenhum', 'lida')).toBeUndefined();
  });
});
