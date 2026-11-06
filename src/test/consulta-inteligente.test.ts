import { describe, expect, it, vi } from 'vitest';
import { iniciarConsultaProcesso, deveConsultarProcesso, type PortasConsulta } from '@/lib/atendimento/consulta-processo';
import type { ProcessoPJ } from '@/lib/projuris/processos';

const agora = new Date('2026-11-06T19:18:00Z');
const processo = (codigo: number): ProcessoPJ => ({ codigo, numero: `100000${codigo}-11.2026.5.02.0001`, segredoJustica: false, situacao: 'Ativo', assunto: 'Trabalhista', envolvidos: [{ codigoPessoa: 7, cliente: true }] });
const entrada = { conversaId: 'isolado', telefone: '+55 (11) 99000-0001', nomeContato: 'Cliente de teste', textoCliente: 'Como está meu processo?', assuntoJaPerguntado: false };
function portas(quantidade = 1) {
  let em = agora.toISOString();
  let descricao = 'Juntada de manifestação.';
  const p: PortasConsulta = {
    agora: () => agora,
    identificar: vi.fn(async () => ({ tipo: 'unico' as const, pessoa: { codigo: 7, nome: 'Cliente de teste' } })),
    processosAtivos: vi.fn(async () => Array.from({ length: quantidade }, (_, i) => processo(i + 1))),
    ultimosAndamentos: vi.fn(async () => [{ data: '06/11/2026', descricao }]),
    estadoLocal: () => ({ sincronizadoEm: em, falha: false }),
    confirmarAtualizacao: vi.fn(async () => { em = agora.toISOString(); }),
    redigir: vi.fn(async () => ''), codigosExistentes: async () => [],
    avisarCliente: vi.fn(async () => {}), enviarRevisora: vi.fn(async () => {}), registrar: vi.fn(async () => {}),
  };
  return { p, antigo: () => { em = '2026-11-05T19:18:00Z'; }, novidade: () => { descricao = 'Despacho registrado.'; } };
}
describe('Consulta inteligente — onze cenários do anexo', () => {
  it('um processo: consulta diretamente, preservando revisão', async () => {
    const { p } = portas(); const r = await iniciarConsultaProcesso(entrada, p);
    expect(r.tipo).toBe('pedido');
    if (r.tipo !== 'pedido') throw new Error('Pedido esperado');
    expect(r.pedido.processos.map(p => p.codigo)).toEqual([1]); expect(r.pedido.selecaoProcessos).toBeUndefined();
  });
  it('dois processos: lista revisada, sem escolher arbitrariamente', async () => {
    const { p } = portas(2); const r = await iniciarConsultaProcesso(entrada, p);
    expect(r.tipo).toBe('pedido');
    if (r.tipo !== 'pedido') throw new Error('Lista esperada');
    expect(r.pedido.selecaoProcessos).toEqual([1, 2]); expect(p.enviarRevisora).toHaveBeenCalledTimes(1);
  });
  it('vários processos: ordinal corresponde à ordem oferecida, não ao identificador', async () => {
    const { p } = portas(4); const r = await iniciarConsultaProcesso({ ...entrada, textoCliente: '2', assuntoJaPerguntado: true, processosOferecidos: [4, 1, 3, 2] }, p);
    expect(r.tipo).toBe('pedido');
    if (r.tipo !== 'pedido') throw new Error('Detalhe esperado');
    expect(r.pedido.processos.map(p => p.codigo)).toEqual([1]);
  });
  it('última movimentação: entra na consulta sem depender da classificação', () => {
    expect(deveConsultarProcesso({ intencao: 'outro', texto: 'Queria saber a última movimentação', encaminharHumano: false, aguardandoAssunto: false })).toBe(true);
  });
  it('movimento novo: confirmação anterior à leitura fornece o novo fato', async () => {
    const t = portas(); t.antigo(); t.p.confirmarAtualizacao = vi.fn(async () => { t.novidade(); });
    // O relógio/snapshot continuam antigos: falha fechada, nenhum pedido desatualizado.
    const r = await iniciarConsultaProcesso(entrada, t.p);
    expect(r.tipo).toBe('equipe'); expect(t.p.enviarRevisora).not.toHaveBeenCalled();
    const fresco = portas(); fresco.p.confirmarAtualizacao = vi.fn(async () => { fresco.novidade(); });
    const novo = await iniciarConsultaProcesso(entrada, fresco.p);
    if (novo.tipo !== 'pedido') throw new Error('Pedido esperado');
    expect(novo.pedido.processos[0]?.andamentos[0]?.descricao).toBe('Despacho registrado.');
  });
  it('sem novidades: preserva o fato e verifica a fonte antes do pedido', async () => {
    const { p } = portas(); const r = await iniciarConsultaProcesso(entrada, p);
    expect(p.confirmarAtualizacao).toHaveBeenCalledWith(1);
    if (r.tipo !== 'pedido') throw new Error('Pedido esperado');
    expect(r.pedido.processos[0]?.andamentos).toEqual([{ data: '06/11/2026', descricao: 'Juntada de manifestação.' }]);
  });
  it('falha ProJuris: não cria pedido nem usa dados anteriores', async () => {
    const { p } = portas(); p.confirmarAtualizacao = vi.fn(async () => { throw new Error('indisponível'); });
    expect((await iniciarConsultaProcesso(entrada, p)).tipo).toBe('equipe'); expect(p.ultimosAndamentos).not.toHaveBeenCalled(); expect(p.enviarRevisora).not.toHaveBeenCalled();
  });
  it('telefone desconhecido: pede confirmação de identidade sem consultar processos', async () => {
    const { p } = portas(); p.identificar = async () => ({ tipo: 'nao_encontrado' }); p.buscarPorCpf = async () => [];
    expect((await iniciarConsultaProcesso(entrada, p)).tipo).toBe('pedir_cpf'); expect(p.processosAtivos).not.toHaveBeenCalled();
  });
  it('telefone compartilhado: não resolve por nome nem lista dados', async () => {
    const { p } = portas(); p.identificar = async () => ({ tipo: 'duplicado', codigos: [7, 8] });
    expect((await iniciarConsultaProcesso(entrada, p)).tipo).toBe('equipe'); expect(p.processosAtivos).not.toHaveBeenCalled();
  });
  it('outro processo: rejeita número não vinculado mesmo com só um processo', async () => {
    const { p } = portas(); const r = await iniciarConsultaProcesso({ ...entrada, textoCliente: 'Consultar 9999999-99.2026.8.26.0100' }, p);
    expect(r.tipo).toBe('equipe'); expect(p.ultimosAndamentos).not.toHaveBeenCalled(); expect(p.enviarRevisora).not.toHaveBeenCalled();
  });
  it('prazo, audiência e documentos pendentes: só usa registro confirmado, ausente vai à equipe', async () => {
    for (const texto of ['Prazo do meu processo', 'Tem audiência marcada?', 'Documentos pendentes do meu processo']) {
      expect(deveConsultarProcesso({ intencao: 'outro', texto, encaminharHumano: false, aguardandoAssunto: false })).toBe(true);
      const { p } = portas(); p.fatosRegistrados = vi.fn(async () => []);
      expect((await iniciarConsultaProcesso({ ...entrada, textoCliente: texto }, p)).tipo).toBe('equipe'); expect(p.enviarRevisora).not.toHaveBeenCalled();
    }
  });
});