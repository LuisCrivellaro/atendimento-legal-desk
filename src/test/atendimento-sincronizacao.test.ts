import { describe, expect, it } from 'vitest';
import { aplicarCaso, aplicarCasos, comPendentes, mensagensRecentes, pendentesResolvidos, removerCaso, type MensagemPendente } from '@/lib/atendimento/sincronizacao';
import { mudouMaterial } from '@/lib/atendimento/cache-casos';
import { ordenarConversas, ultimaMensagem } from '@/lib/atendimento/conversation-order';
import { needsReply, replyQueue } from '@/lib/atendimento';
import { buildAssessor } from '@/lib/assessor';
import type { Conversa, Mensagem } from '@/lib/mock-data';

const msg = (id: string, de: Mensagem['de'], iso: string, extra: Partial<Mensagem> = {}): Mensagem => ({ id, de, texto: `t-${id}`, hora: '', dataHora: iso, ...extra });
const conversa = (id: string, ultima: string, extra: Partial<Conversa> = {}): Conversa => ({
  id, nome: id, cpf: '', telefone: '', atendimento: '', etapa: 'inicial', naoLidas: 0, etapaPipeline: 0, syncs: [], processos: [], documentos: [], timeline: [],
  mensagens: [msg(`${id}-1`, 'cliente', ultima)], lastMessageAt: ultima, ...extra,
});

describe('lista de conversas atualizada por conversa (sem recarregar tudo)', () => {
  const base = [conversa('a', '2026-11-26T10:00:00Z'), conversa('b', '2026-11-26T09:00:00Z'), conversa('c', '2026-11-26T08:00:00Z')].sort(ordenarConversas);

  it('nova mensagem leva a conversa ao topo e mantém a referência das demais', () => {
    const c = { ...base[2]!, lastMessageAt: '2026-11-26T11:00:00Z', mensagens: [...base[2]!.mensagens, msg('c-2', 'cliente', '2026-11-26T11:00:00Z')] };
    const nova = aplicarCaso(base, c);
    expect(nova.map(x => x.id)).toEqual(['c', 'a', 'b']);
    expect(nova[1]).toBe(base[0]);
    expect(nova[2]).toBe(base[1]);
  });

  it('conversa igual não muda a lista (nenhum redesenho)', () => {
    expect(aplicarCaso(base, JSON.parse(JSON.stringify(base[1])))).toBe(base);
  });

  it('insere conversa nova na posição certa e remove', () => {
    const nova = aplicarCasos(base, [conversa('d', '2026-11-26T09:30:00Z')]);
    expect(nova.map(x => x.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(nova).toEqual([...nova].sort(ordenarConversas));
    expect(removerCaso(nova, 'd').map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect(removerCaso(base, 'zzz')).toBe(base);
  });

  it('eventos repetidos da mesma conversa nunca duplicam a linha', () => {
    let l = base;
    for (let i = 0; i < 5; i++) l = aplicarCaso(l, { ...base[1]!, nome: `b${i}` });
    expect(l.filter(x => x.id === 'b')).toHaveLength(1);
    expect(l).toHaveLength(3);
  });
});

describe('mensagens pendentes (exibição otimista)', () => {
  const c = conversa('a', '2026-11-26T10:00:00Z');
  const p: MensagemPendente = { id: 'p1', conversaId: 'a', texto: 'Olá', autor: 'Ana Souza', criadaEm: '2026-11-26T10:01:00Z', estado: 'enviando' };

  it('aparece na conversa antes do servidor e nunca duplica depois que ele grava', () => {
    expect(comPendentes(c, [p]).mensagens.map(m => m.id)).toEqual(['a-1', 'p1']);
    const gravada = { ...c, mensagens: [...c.mensagens, { ...msg('p1', 'escritorio', p.criadaEm), status: 'enviada' as const }] };
    expect(comPendentes(gravada, [p]).mensagens.filter(m => m.id === 'p1')).toHaveLength(1);
    expect(comPendentes(gravada, [p]).mensagens.at(-1)?.status).toBe('enviada');
    expect(pendentesResolvidos(gravada, [p])).toEqual(['p1']);
  });

  it('reserva sem recibo ainda não resolve; falha registrada resolve', () => {
    const reservada = { ...c, mensagens: [...c.mensagens, { ...msg('p1', 'escritorio', p.criadaEm), envio: { estado: 'enviando' as const, reservadoEm: p.criadaEm } }] };
    expect(pendentesResolvidos(reservada, [p])).toEqual([]);
    const falhou = { ...c, mensagens: [...c.mensagens, { ...msg('p1', 'escritorio', p.criadaEm), envio: { estado: 'falhou' as const, reservadoEm: p.criadaEm } }] };
    expect(pendentesResolvidos(falhou, [p])).toEqual(['p1']);
  });

  it('pendente de outra conversa não aparece aqui', () => {
    expect(comPendentes(c, [{ ...p, conversaId: 'b' }])).toBe(c);
  });

  it('envio da equipe que falhou não tira a conversa de "aguardando"', () => {
    const falhou = { ...c, mensagens: [...c.mensagens, { ...msg('e1', 'escritorio', '2026-11-26T10:02:00Z'), envio: { estado: 'falhou' as const, reservadoEm: '2026-11-26T10:02:00Z' } }] };
    expect(ultimaMensagem(falhou.mensagens)?.id).toBe('a-1');
    expect(needsReply(falhou)).toBe(true);
    const enviada = { ...c, mensagens: [...c.mensagens, { ...msg('e1', 'escritorio', '2026-11-26T10:02:00Z'), status: 'enviada' as const }] };
    expect(needsReply(enviada)).toBe(false);
  });
});

describe('painel e contadores', () => {
  it('mensagens recentes dão o mesmo "aguardando" da conversa inteira', () => {
    const longa = Array.from({ length: 200 }, (_, i) => msg(`m${i}`, i % 2 ? 'escritorio' : 'cliente', new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString()));
    // Mensagem antiga no fim do array (importação fora de ordem) não engana o contador.
    const fora = [...longa.slice(0, 199), msg('antiga', 'cliente', '2026-01-01T00:00:00Z'), longa[199]!];
    for (const lista of [longa, fora, longa.slice(0, 199)]) {
      const r = mensagensRecentes(lista);
      expect(r.length).toBeLessThanOrEqual(31);
      expect(needsReply({ mensagens: r })).toBe(needsReply({ mensagens: lista }));
      expect(ultimaMensagem(r)?.id).toBe(ultimaMensagem(lista)?.id);
    }
    const curta = longa.slice(0, 5);
    expect(mensagensRecentes(curta)).toBe(curta);
  });

  it('menu lateral conta as mesmas conversas da aba "Aguardando" (só as do usuário)', () => {
    const casos = [
      { id: '1', nome: 'Minha', pipeline: 0, mine: true, prazos: [], mensagens: [msg('x', 'cliente', '2026-11-26T10:00:00Z')] },
      { id: '2', nome: 'Da colega', pipeline: 0, mine: false, prazos: [], mensagens: [msg('y', 'cliente', '2026-11-26T10:00:00Z')] },
      { id: '3', nome: 'Respondida', pipeline: 0, mine: true, prazos: [], mensagens: [msg('z', 'cliente', '2026-11-26T10:00:00Z'), msg('w', 'escritorio', '2026-11-26T10:05:00Z')] },
    ];
    const a = buildAssessor(casos, '2026-11-26');
    expect(a.badges['/atendimento']).toBe(1);
    expect(a.tasks.find(t => t.id === 'waiting')?.label).toBe('2 conversas aguardando resposta');
    const minhas = casos.filter(c => c.mine).map(c => conversa(c.id, '2026-11-26T10:00:00Z', { mensagens: c.mensagens }));
    expect(replyQueue(minhas)).toHaveLength(a.badges['/atendimento']);
  });

  it('só campos da revisão material pedem nova leitura de aprovação', () => {
    const c = conversa('a', '2026-11-26T10:00:00Z');
    expect(mudouMaterial(c, { ...c, mensagens: [...c.mensagens, msg('n', 'escritorio', '2026-11-26T10:05:00Z')] })).toBe(false);
    expect(mudouMaterial(c, { ...c, timeline: [{ data: 'x', evento: 'y' }], etapaPipeline: 3 })).toBe(false);
    expect(mudouMaterial(c, { ...c, modoIA: 'Sugerir' })).toBe(true);
    expect(mudouMaterial(c, { ...c, documentos: [{ nome: 'RG', recebido: true }] })).toBe(true);
  });
});
