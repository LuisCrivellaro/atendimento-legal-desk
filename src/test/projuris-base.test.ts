import { describe, it, expect, vi } from 'vitest';
import { dadosDesatualizados, respostaFactual } from '@/lib/projuris/base';
import { lerTodosAndamentos, portasLocais } from '@/lib/projuris/base.server';
import { iniciarConsultaProcesso, CONFIG_CONSULTA_PADRAO, type PortasConsulta } from '@/lib/atendimento/consulta-processo';
import type { ProcessoPJ } from '@/lib/projuris/processos';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
const processo: ProcessoPJ = { codigo: 34, segredoJustica: false, numero: '1000001-11.2026.5.02.0001', envolvidos: [{ codigoPessoa: 7, cliente: true }] };
const agora = Date.parse('2026-11-03T18:00:00Z');
describe('Base própria e sincronização manual', () => {
  it('considera dados desatualizados após 15 minutos, sem confundir data do andamento', () => {
    expect(dadosDesatualizados('2026-11-03T17:45:00Z', agora)).toBe(false);
    expect(dadosDesatualizados('2026-11-03T17:44:59Z', agora)).toBe(true);
    const texto = respostaFactual([{ processo, andamentos: [{ data: '01/11/2026', descricao: 'Juntada de documento' }], sincronizadoEm: '2026-11-03T17:00:00Z', falha: true }], agora);
    expect(texto).toContain('01/11/2026'); expect(texto).toContain('03/11/2026'); expect(texto).toContain('Não foi possível confirmar');
    expect(texto).not.toContain('favorável');
  });
  it('nunca revela descrição de processo em segredo', () => {
    expect(respostaFactual([{ processo: { ...processo, segredoJustica: true }, andamentos: [{ data: '01/11/2026', descricao: 'DADO CONFIDENCIAL' }], sincronizadoEm: null, falha: false }])).not.toContain('DADO CONFIDENCIAL');
  });
  it('lê páginas intermediárias e deduplica pelo identificador oficial', async () => {
    const chamar = vi.fn(async (_op, c) => ({ totalRegistros: 3, andamentoProcessoWs: [{ codigoAndamento: c.consulta.pagina + 1, descricaoAndamento: 'Registro', privado: false, dataAndamento: '2026-11-01' }] }));
    const r = await lerTodosAndamentos(34, { chamar } as never);
    expect(r.map(a => a.codigo)).toEqual([1, 2, 3]); expect(chamar).toHaveBeenCalledTimes(3);
  });
  it('não aceita snapshot incompleto nem inventa movimentação', async () => {
    const chamar = vi.fn(async () => ({ totalRegistros: 2, andamentoProcessoWs: [{ codigoAndamento: 1, descricaoAndamento: 'Registro', privado: false }] }));
    await expect(lerTodosAndamentos(34, { chamar } as never)).rejects.toThrow('sem avanço');
  });
  it('envio factual autorizado usa somente datas/descrições locais, sem modelo ou revisão', async () => {
    const redigir = vi.fn(); const revisar = vi.fn();
    const p: PortasConsulta = { agora: () => new Date(agora), identificar: async () => ({ tipo: 'unico', pessoa: { codigo: 7, nome: 'CLIENTE' } }), processosAtivos: async () => [processo], ultimosAndamentos: async () => [{ data: '01/11/2026', descricao: 'Juntada de documento' }], estadoLocal: () => ({ sincronizadoEm: '2026-11-03T17:50:00Z', falha: false }), redigir, codigosExistentes: async () => [], avisarCliente: async () => {}, enviarRevisora: revisar, registrar: async () => {} };
    const r = await iniciarConsultaProcesso({ conversaId: 'c', telefone: '11999990000', nomeContato: 'CLIENTE', textoCliente: 'Como está meu processo?', assuntoJaPerguntado: false }, p, { ...CONFIG_CONSULTA_PADRAO, aprovacao_processo: false });
    expect(r.tipo).toBe('factual'); if (r.tipo !== 'factual') throw new Error('Factual esperado');
    expect(r.mensagem).toContain('Juntada de documento'); expect(r.mensagem).toContain('01/11/2026'); expect(redigir).not.toHaveBeenCalled(); expect(revisar).not.toHaveBeenCalled();
  });
  it('leitura local mantém o escopo do proprietário e funciona sem rede ProJuris', async () => {
    const owners: string[] = [];
    const db = { from: (t: string) => { const q = { select: () => q, eq: (_col: string, owner: string) => { owners.push(owner); return q; }, maybeSingle: async () => ({ data: { carteira: { lista: [], processos: { '7': [{ codigoProcesso: 34, segredoJustica: false, envolvidos: [{ codigoPessoa: 7, flagCliente: true }] }] }, nomes: {}, em: '2026-11-03T17:00:00Z' } }, error: null }), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null, data: t === 'projuris_sync_processos' ? [{ codigo_processo: 34, atuais: [{ codigo: 1, data: '2026-11-01', descricao: 'Juntada', privado: false }], ultimo_sucesso: '2026-11-03T17:00:00Z' }] : [] }).then(resolve) }; return q; } } as unknown as SupabaseClient<Database>;
    const p = await portasLocais(db, 'owner-A');
    expect(owners).toEqual(['owner-A', 'owner-A']); expect((await p?.ultimosAndamentos(34))?.[0]?.descricao).toBe('Juntada');
  });
});