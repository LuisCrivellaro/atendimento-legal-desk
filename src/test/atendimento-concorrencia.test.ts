import { describe, expect, it } from 'vitest';
import { atualizarConversa } from '@/lib/atendimento/ana.server';
import { reservarEnvioEquipe, concluirEnvioEquipe } from '@/lib/atendimento/envio-equipe';
import { aplicarAck, vincularEco } from '@/lib/atendimento/recibos-whatsapp';
import type { Conversa, Mensagem } from '@/lib/mock-data';

/**
 * Banco falso com a mesma condição de corrida do real: leitura e gravação separadas, gravação condicionada ao
 * `updated_at` lido (CAS) e atrasos aleatórios para intercalar as operações simultâneas.
 */
function bancoFalso(inicial: Conversa) {
  let linha = { dados: structuredClone(inicial), updated_at: '0' };
  let versao = 0, conflitos = 0;
  const atraso = () => new Promise(r => setTimeout(r, Math.random() * 4));
  const db = {
    from: () => {
      let filtroVersao: string | undefined; let novo: { dados: Conversa } | undefined;
      const q = {
        select: () => q,
        eq: (col: string, v: string) => { if (col === 'updated_at') filtroVersao = v; return q; },
        update: (d: { dados: Conversa }) => { novo = d; return q; },
        single: async () => { await atraso(); return { data: structuredClone(linha), error: null }; },
        then: async (resolve: (v: unknown) => unknown) => {
          await atraso();
          if (!novo) return resolve({ data: [], error: null });
          if (filtroVersao !== linha.updated_at) { conflitos++; return resolve({ data: [], error: null }); }
          linha = { dados: structuredClone(novo.dados), updated_at: String(++versao) };
          return resolve({ data: [{ id: 'c' }], error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as Parameters<typeof atualizarConversa>[0], ler: () => linha.dados, conflitos: () => conflitos };
}

const base = (): Conversa => ({ id: 'c', nome: 'C', cpf: '', telefone: '', atendimento: '', etapa: 'inicial', naoLidas: 0, etapaPipeline: 0, syncs: [], processos: [], documentos: [], timeline: [], mensagens: [] });
const cliente = (i: number): Mensagem => ({ id: `ultramsg:55:${i}`, de: 'cliente', texto: `m${i}`, hora: '', dataHora: new Date(Date.UTC(2026, 10, 26, 12, 0, i)).toISOString() });
const inserir = (m: Mensagem) => (c: Conversa) => c.mensagens.some(x => x.id === m.id) ? c : { ...c, mensagens: [...c.mensagens, m] };

describe('gravações simultâneas na conversa (CAS de atualizarConversa)', () => {
  it('rajada de mensagens do cliente, com repetições do provedor: nenhuma perdida, nenhuma duplicada', async () => {
    const b = bancoFalso(base());
    const entradas = [0, 1, 2, 3, 4, 2, 0].map(cliente);
    // Até 5 tentativas por gravação (limite do atualizarConversa): grupos de 4 simultâneas cabem com folga.
    for (let i = 0; i < entradas.length; i += 4) await Promise.all(entradas.slice(i, i + 4).map(m => atualizarConversa(b.db, 'c', inserir(m))));
    const ids = b.ler().mensagens.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([0, 1, 2, 3, 4].map(i => `ultramsg:55:${i}`).sort());
  });

  it('envio da equipe, eco, recibos e mensagem do cliente ao mesmo tempo terminam consistentes', async () => {
    const b = bancoFalso({ ...base(), mensagens: [cliente(0)] });
    const id = '22222222-2222-4222-8222-222222222222';
    await atualizarConversa(b.db, 'c', c => { const d = reservarEnvioEquipe(c, { id, texto: 'Bom dia', autor: 'Equipe', agora: new Date('2026-11-26T12:01:00Z') }); return d.acao === 'reservar' ? d.conversa : c; });
    await Promise.all([
      atualizarConversa(b.db, 'c', c => concluirEnvioEquipe(c, id, { status: 'enviada', canal: 'ultramsg', idExterno: '1' })),
      atualizarConversa(b.db, 'c', c => vincularEco(c, 'Bom dia', 'wa1', new Date('2026-11-26T12:01:05Z')) ?? c),
      atualizarConversa(b.db, 'c', inserir(cliente(9))),
    ]);
    await atualizarConversa(b.db, 'c', c => aplicarAck(c, 'wa1', 'lida') ?? c);
    const c = b.ler();
    const equipe = c.mensagens.filter(m => m.id === id);
    expect(equipe).toHaveLength(1);
    expect(equipe[0]).toMatchObject({ status: 'lida', idWhatsApp: 'wa1', idExterno: '1' });
    expect(equipe[0]?.envio).toBeUndefined();
    expect(c.mensagens.map(m => m.id)).toContain('ultramsg:55:9');
    expect(c.agenteAna?.humano).toBe(true);
  });
});
