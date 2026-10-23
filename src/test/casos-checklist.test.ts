import { describe, expect, it, vi } from 'vitest';
import type { Conversa } from '@/lib/mock-data';
import { salvarCaso } from '@/lib/casos';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
describe('documentos-base persistentes', () => {
  it('salva itens novos em checklist_itens e retorna IDs para próximas marcações', async () => {
    const antes = { id: 'caso', nome: 'Teste', etapa: 'documentos', documentos: [], mensagens: [] } as unknown as Conversa;
    const depois = { ...antes, documentos: [{ nome: 'RG ou CNH', recebido: false }] };
    const rows: any[] = []; const insert = vi.fn((items: any[]) => { rows.push(...items.map((x, i) => ({ ...x, id: `item-${i}` }))); });
    mocks.from.mockImplementation((table: string) => {
      let updated = false;
      const query: any = { select: () => query, eq: () => query, single: async () => ({ error: null, data: { owner_id: 'owner', dados: antes, updated_at: 'v1' } }), update: () => { updated = true; return query; }, insert: (x: any[]) => { insert(x); return query; }, then: (resolve: any) => Promise.resolve({ error: null, data: table === 'checklist_itens' ? [...rows] : updated ? [{ id: 'caso' }] : [] }).then(resolve) };
      return query;
    });
    await salvarCaso(antes, depois);
    expect(insert).toHaveBeenCalledWith([{ caso_id: 'caso', owner_id: 'owner', nome: 'RG ou CNH', recebido: false, ordem: 0 }]);
    expect((depois.documentos[0] as { id?: string }).id).toBe('item-0');
  });
});