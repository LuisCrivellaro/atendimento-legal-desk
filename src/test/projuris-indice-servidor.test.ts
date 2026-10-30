import { describe, expect, it, vi } from 'vitest';
import { criarIndiceServidor, VALIDADE_INDICE_MS } from '@/lib/projuris/indice.server';
import type { criarConsultasProjuris } from '@/lib/projuris/consultas.server';

describe('índice privado ProJuris', () => {
  it('páginas de 100, telefone principal, expiração de 30 minutos', async () => {
    let now = 0;
    const page = vi.fn(async (pagina: number) => ({ total: 101, pessoas: pagina === 0 ? Array.from({ length: 100 }, (_, i) => ({ codigo: i + 1, nome: 'Teste', telefones: [{ numero: '5511999600306', principal: i === 0 }] })) : [{ codigo: 101, nome: 'Outro', telefones: [{ numero: '5511942074361', principal: true }] }] }));
    const identificar = criarIndiceServidor({ pessoasCompletas: page } as unknown as ReturnType<typeof criarConsultasProjuris>, () => now);
    expect(await identificar('5511999600306')).toMatchObject({ tipo: 'unico', pessoa: { codigo: 1 } });
    expect(page.mock.calls).toEqual([[0, 100], [1, 100]]); expect(VALIDADE_INDICE_MS).toBe(1800000);
    now = 1799999; await identificar('5511942074361'); expect(page).toHaveBeenCalledTimes(2);
    now = 1800000; await identificar('5511942074361'); expect(page).toHaveBeenCalledTimes(4);
  });
});