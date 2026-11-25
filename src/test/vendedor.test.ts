import { describe, it, expect } from 'vitest';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultAutomations } from '@/lib/atendimento';
import { decidirFollowupVendedor, recusaOuParar, textoFollowupVendedor, type EntradaVendedor } from '@/lib/atendimento/vendedor';

// Dados fictícios. 25/11/2026 é quarta-feira.
const fixture = conversas[1];
if (!fixture) throw new Error('fixture');
const oferta = { id: 'o1', de: 'escritorio' as const, canal: 'ultramsg', texto: 'Tenho estes horários livres na agenda:\n1. Quinta, 26/11, às 10h\nPara escolher um horário, responda com o número da opção desejada.', hora: '10:00', dataHora: '2026-11-24T13:00:00.000Z' };
const lead = (extra: Partial<Conversa> = {}): Conversa => ({ ...fixture, etapa: 'inicial', mensagens: [{ id: 'c1', de: 'cliente', canal: 'ultramsg', texto: 'quero agendar', hora: '09:59', dataHora: '2026-11-24T12:59:00.000Z' }, oferta], agenteAna: { agendaReal: true, horariosApresentados: ['2026-11-26T13:00:00.000Z'] }, ...extra });
const e = (c: Conversa, ligado = true): EntradaVendedor => ({ ligado, conversa: c, modo: 'Automática' });
const quarta14h = new Date('2026-11-25T17:00:00.000Z');

describe('P1-3 · atendente vendedor (desligado por padrão)', () => {
  it('desligado por padrão: nenhum follow-up', () => {
    expect(defaultAutomations.vendedor).toBe(false);
    expect(decidirFollowupVendedor(e(lead(), defaultAutomations.vendedor), quarta14h)).toBeUndefined();
  });
  it('ligado: um follow-up 24 h depois da oferta sem escolha, em dia útil', () => {
    expect(decidirFollowupVendedor(e(lead()), quarta14h)).toEqual({ ofertaEm: oferta.dataHora });
    expect(decidirFollowupVendedor(e(lead()), new Date('2026-11-25T12:00:00.000Z'))).toBeUndefined();
    expect(decidirFollowupVendedor(e(lead()), new Date('2026-11-28T15:00:00.000Z'))).toBeUndefined();
  });
  it('só um por oferta', () => {
    expect(decidirFollowupVendedor(e(lead({ agenteAna: { agendaReal: true, horariosApresentados: ['x'], followupVendedor: { ofertaEm: oferta.dataHora } } })), quarta14h)).toBeUndefined();
  });
  it('nunca depois de recusa, para cliente da casa, com consulta marcada ou se o cliente respondeu', () => {
    const recusa = lead({ mensagens: [{ id: 'c0', de: 'cliente', canal: 'ultramsg', texto: 'não tenho interesse', hora: '', dataHora: '2026-11-24T12:00:00.000Z' }, oferta] });
    expect(decidirFollowupVendedor(e(recusa), quarta14h)).toBeUndefined();
    expect(decidirFollowupVendedor(e(lead({ tipoClienteAgenda: 'cadastrado' })), quarta14h)).toBeUndefined();
    expect(decidirFollowupVendedor(e(lead({ consultaAgendada: '2026-11-26T13:00:00.000Z' })), quarta14h)).toBeUndefined();
    const respondeu = lead({ mensagens: [oferta, { id: 'c2', de: 'cliente', canal: 'ultramsg', texto: 'vou ver e te falo', hora: '', dataHora: '2026-11-24T14:00:00.000Z' }] });
    expect(decidirFollowupVendedor(e(respondeu), quarta14h)).toBeUndefined();
    expect(decidirFollowupVendedor({ ...e(lead()), modo: 'Sugerir' }, quarta14h)).toBeUndefined();
  });
  it('texto sem preço, promessa ou pressão; horários vêm da agenda real', () => {
    const t = textoFollowupVendedor('ana paula', 'Tenho estes horários livres na agenda:\n1. Quinta');
    expect(t).toMatch(/^Oi, Ana! Tudo bem\? 😊\nPassando para lembrar que a primeira consulta com a Dra\. Carolina é on-line e gratuita\./);
    expect(t).not.toMatch(/R\$|desconto|garant|ganhar|últim[ao]s? vag|corra/i);
    for (const s of ['Não tenho interesse', 'pode parar de mandar mensagem', 'já contratei outro advogado']) expect(recusaOuParar(s)).toBe(true);
    expect(recusaOuParar('quero agendar')).toBe(false);
  });
});
