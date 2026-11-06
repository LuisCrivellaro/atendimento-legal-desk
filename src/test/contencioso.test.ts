import { describe, expect, it, vi } from 'vitest';
import { projetarProcessos, movimentosDe, filtrosContencioso, filtrarProcessos, paginar, ordenarMovimentos } from '@/lib/contencioso';
import { lerTodosAndamentos } from '@/lib/projuris/base.server';
import type { BaseProjuris } from '@/lib/projuris/base';
const base = { lista: [{ codigo: 7, nome: 'CLIENTE', cpfCnpj: '123', nomeExibicao: 'RT - 00009 - CLIENTE' }, { codigo: 8, nome: 'CLIENTE', cpfCnpj: '456' }], nomes: {}, em: '2026-11-06', semData: 0, processos: { '7': [{ codigoProcesso: 9, identificador: 'PRO.0000009', processoNumeroWs: [{ numeroDoProcesso: '1001676-10.2025.5.02.0001', principal: true }], processoEnvolvidoSimplificadoWs: [{ codigoPessoaEnvolvido: 7, flagCliente: true, participacao: 'PARTE_ATIVA' }], orgaoJudicial: { valor: 'TRT 2' }, situacaoProcesso: { valor: 'Ativo', chave: 1 } }], '8': [] } } as unknown as BaseProjuris;
const estado = { codigo_processo: 9, atuais: [{ codigo: 1, descricao: 'Original\nintacto', data: '2026-11-04', privado: true }], ultimo_sucesso: '2026-11-06T18:00:00Z', tentativa_em: null, erro: null, falhas: 0, retry_em: null };
describe('Contencioso persistente', () => {
  it('associa por pessoa e flagCliente, nunca por nomes iguais', () => {
    const p = projetarProcessos(base, [estado])[0]; expect(p?.clientes.map(c => c.codigo)).toEqual([7]); expect(p?.numero).toBe('1001676-10.2025.5.02.0001'); expect(p?.classe).toBeNull();
  });
  it('preserva descrições originais e movimentos privados para a equipe, deduplicando IDs', () => {
    const a = movimentosDe({ ...estado, atuais: [...estado.atuais, ...estado.atuais] }); expect(a).toHaveLength(1); expect(a[0]?.descricao).toBe('Original\nintacto'); expect(a[0]?.privado).toBe(true);
  });
  it('filtra cliente, tribunal, situação e período sem inventar datas', () => {
    const ps = projetarProcessos(base, [estado]); expect(filtrarProcessos(ps, filtrosContencioso.parse({ cliente: '7', tribunal: 'TRT 2', situacao: 'Ativo', inicio: '2026-11-04', fim: '2026-11-04' }))).toHaveLength(1);
    expect(filtrarProcessos(ps, filtrosContencioso.parse({ cliente: '8' }))).toHaveLength(0); expect(filtrarProcessos(ps, filtrosContencioso.parse({ inicio: '2026-11-05' }))).toHaveLength(0);
  });
  it('mantém os 220 andamentos disponíveis em cinco páginas de 50', () => {
    const a = Array.from({ length: 220 }, (_, i) => ({ codigo: i + 1, codigoProcesso: 9, descricao: 'Original', privado: false, dia: '2026-11-04' }));
    expect(paginar(ordenarMovimentos(a), 4, 50).itens).toHaveLength(20); expect(paginar(a, 0, 50).total).toBe(220);
  });
  it('não interrompe paginação sem total no primeiro lote', async () => {
    const chamar = vi.fn(async (_op, req) => req.consulta.pagina < 5 ? { andamentoProcessoWs: Array.from({ length: req.consulta.pagina === 4 ? 20 : 50 }, (_, i) => ({ codigoAndamento: req.consulta.pagina * 50 + i + 1, descricaoAndamento: 'Original', privado: false })) } : { andamentoProcessoWs: [] });
    const a = await lerTodosAndamentos(9, { chamar } as never); expect(a).toHaveLength(220); expect(chamar).toHaveBeenCalledTimes(6);
  });
});