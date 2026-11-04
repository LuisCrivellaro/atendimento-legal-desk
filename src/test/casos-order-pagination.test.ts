import { describe, expect, it, vi } from 'vitest';
import { listarCasos } from '@/lib/casos';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));

describe('Paginação por última mensagem', () => {
  it('usa cursor timestamp/id, elimina duplicados e inclui conversas sem data no final', async () => {
    const timestamp = '2026-11-04T13:50:00Z';
    const row = (id: string, last_message_at: string | null) => ({id, nome: id, etapa: 'inicial', last_message_at, dados: {mensagens: []}});
    const primeira = Array.from({length: 500}, (_, i) => row(String(1000-i), timestamp));
    const filtros: string[] = [];
    const paginas = [primeira, [row('1000', timestamp), row('499', '2026-11-03T13:50:00Z')], [row('sem-data', null)]];
    let pagina = 0;
    const offsets = vi.fn();
    mocks.from.mockImplementation((table: string) => {
      const q = {
        select: () => q, order: () => q, limit: () => q, not: () => q, is: () => q, lt: () => q,
        or: (filter: string) => { filtros.push(filter); return q; },
        range: offsets,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({error: null, data: table === 'casos' ? paginas[pagina++] ?? [] : []}).then(resolve),
      };
      return q;
    });
    const casos = await listarCasos();
    expect(filtros).toEqual(['last_message_at.lt.2026-11-04T13:50:00Z,and(last_message_at.eq.2026-11-04T13:50:00Z,id.lt.501)']);
    expect(casos).toHaveLength(502);
    expect(new Set(casos.map(c => c.id)).size).toBe(502);
    expect(casos.at(-1)?.id).toBe('sem-data');
    expect(offsets).toHaveBeenCalledTimes(1); // Só checklist; casos não usam offset.
  });
});