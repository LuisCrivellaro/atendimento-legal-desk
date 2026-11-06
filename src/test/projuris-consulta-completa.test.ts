import { describe, expect, it, vi } from 'vitest';
import { criarConsultasProjuris } from '@/lib/projuris/consultas.server';
import type { ClienteProjuris } from '@/lib/projuris/cliente.server';
describe('Consultas oficiais completas', () => {
  it('último movimento pode estar na página intermediária', async () => {
    const chamar = vi.fn(async (_op: string, c: { consulta?: Record<string, number | string> }) => {
      const pagina = Number(c.consulta?.['pagina']);
      return { totalRegistros: 3, andamentoProcessoWs: [{ codigoAndamento: pagina + 1, descricaoAndamento: `Registro ${pagina + 1}`, dataAndamento: pagina === 1 ? '2026-11-06' : '2026-10-01', privado: false }] };
    });
    const consultas = criarConsultasProjuris({ chamar } as unknown as Pick<ClienteProjuris, 'chamar'>);
    const movimentos = await consultas.ultimosAndamentos(1, 1);
    expect(movimentos[0]?.descricao).toBe('Registro 2'); expect(chamar).toHaveBeenCalledTimes(3);
  });
  it('processos sem total continuam até página vazia e preservam vínculos', async () => {
    const chamar = vi.fn(async (op: string, c: { consulta?: Record<string, number | string> }) => op === 'tipo.consulta' ? [{ chave: 7, valor: 'Ativo' }] : { processoConsultaCompleta: Number(c.consulta?.['pagina']) < 2 ? [{ codigoProcesso: Number(c.consulta?.['pagina']) + 1, codigoSituacao: 7, segredoJustica: false, envolvidos: [{ codigoPessoa: 9, flagCliente: true }] }] : [] });
    const consultas = criarConsultasProjuris({ chamar } as unknown as Pick<ClienteProjuris, 'chamar'>);
    expect((await consultas.processosAtivos(9)).map(p => p.codigo)).toEqual([1, 2]); expect(chamar).toHaveBeenCalledTimes(4);
  });
});