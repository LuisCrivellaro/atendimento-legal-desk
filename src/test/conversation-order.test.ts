import { describe, it, expect } from 'vitest';
import { ultimaMensagem, ordenarConversas, timestampWhatsApp, timestampWhatsAppReal, ultimaRecebida } from '@/lib/atendimento/conversation-order';
import { unread } from '@/lib/atendimento';
import { conversas, type Conversa, type Mensagem } from '@/lib/mock-data';
const base = conversas[0]; if (!base) throw new Error('Fixture ausente');
const m = (id: string, dataHora: string, de: Mensagem['de'] = 'cliente'): Mensagem => ({ id, dataHora, de, hora: '', texto: id });
const c = (id: string, mensagens: Mensagem[]): Conversa => ({ ...base, id, mensagens });
describe('Ordenação real WhatsApp', () => {
  it('cenário obrigatório: D agora, C há 10 minutos, B há 2 horas, A há 5 dias', () => {
    const lista = [c('A', [m('a', '2026-10-30T13:50:00Z')]), c('B', [m('b', '2026-11-04T11:50:00Z')]), c('C', [m('c', '2026-11-04T13:40:00Z')]), c('D', [m('d', '2026-11-04T13:50:00Z')])];
    expect(lista.sort(ordenarConversas).map(x => x.id)).toEqual(['D', 'C', 'B', 'A']);
  });
  it('histórico importado aceita segundos, milissegundos e ISO sem promover mensagens antigas', () => {
    const now = new Date('2026-11-04T13:50:00Z');
    for (const value of [1793727000, 1793727000000, '2026-11-03T14:30:00-03:00']) expect(timestampWhatsAppReal(value, now)).toBe('2026-11-03T17:30:00.000Z');
  });
  it('histórico sem timestamp verificável não recebe a data de hoje', () => {
    const now = new Date('2026-11-04T13:50:00Z');
    for (const value of [undefined, '', 'inválido', 0, '2026-11-05T00:00:00Z']) expect(timestampWhatsAppReal(value, now)).toBeUndefined();
  });
  it('data do banco prevalece sobre mudanças cadastrais e mensagens simuladas', () => {
    const antiga = {...c('A', [m('a', '2026-11-04T13:50:00Z')]), lastMessageAt: '2026-10-30T13:50:00Z'};
    const recente = {...c('B', []), lastMessageAt: '2026-11-04T11:50:00Z'};
    expect([antiga, recente].sort(ordenarConversas).map(x => x.id)).toEqual(['B', 'A']);
  });
  for (const [remetente, de, autor] of [['cliente', 'cliente', ''], ['equipe', 'escritorio', 'Equipe'], ['Ana', 'escritorio', 'ANA'], ['celular', 'escritorio', 'Equipe · celular']] as const) {
    it(`${remetente} coloca a conversa mais recente no topo`, () => {
      const antigo = c('a', [m('1', '2026-11-03T17:30:00Z')]); const novo = c('c', [{ ...m('2', '2026-11-03T17:35:00Z', de), autor }]);
      expect([antigo, novo].sort(ordenarConversas).map(x => x.id)).toEqual(['c', 'a']);
    });
  }
  it('duas mensagens fora de ordem usam maior timestamp e não a posição do array', () => {
    expect(ultimaMensagem([m('novo', '2026-11-03T17:35:00Z'), m('antigo', '2026-11-03T17:30:00Z')])?.id).toBe('novo');
  });
  it('mensagem de sistema ou simulada não sobe a conversa', () => {
    expect(ultimaMensagem([m('real', '2026-11-03T17:30:00Z'), m('sistema', '2026-11-03T18:00:00Z', 'sistema'), { ...m('sim', '2026-11-03T19:00:00Z', 'escritorio'), status: 'simulada' }])?.id).toBe('real');
  });
  it('normaliza segundos/milissegundos e fusos para o mesmo instante', () => {
    const now = new Date('2026-11-04T00:00:00Z');
    for (const v of [1793727000, 1793727000000, '2026-11-03T14:30:00-03:00']) expect(timestampWhatsApp(v, now)).toBe('2026-11-03T17:30:00.000Z');
  });
  it('reentrega não duplica não lidas; marcar só até mensagem observada preserva nova mensagem', () => {
    const antiga = m('1', '2026-11-03T17:30:00Z'); const novo = m('2', '2026-11-03T17:35:00Z');
    const lidoAte = ultimaRecebida(c('a', [antiga]));
    expect(unread({ mensagens: [antiga, novo, novo], lidoAte })).toBe(1);
  });
  it('filtros e abas não mudam a ordem relativa e conversas sem data ficam no fim', () => {
    const lista = [c('sem', []), c('a', [m('1', '2026-11-03T17:30:00Z')]), c('b', [m('2', '2026-11-03T17:25:00Z')]), c('c', [m('3', '2026-11-03T16:50:00Z')])];
    expect(lista.filter(x => x.id !== 'b').sort(ordenarConversas).map(x => x.id)).toEqual(['a', 'c', 'sem']);
  });
});