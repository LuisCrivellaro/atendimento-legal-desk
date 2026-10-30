import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';
import { processarAna } from '@/lib/atendimento/ana.server';
import { decidirPedidoProcesso, executarPendenciasProcesso, receberRevisora } from '@/lib/atendimento/consulta-processo.server';
import { hashTexto, respostaAutorizada, TEXTOS_CONSULTA } from '@/lib/atendimento/consulta-processo';

const m = vi.hoisted(() => ({ gerar: vi.fn(), identificar: vi.fn(), processos: vi.fn(), andamentos: vi.fn(), redigir: vi.fn(), enviar: vi.fn(), revisora: vi.fn() }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: m.gerar }));
vi.mock('@/lib/projuris/indice.server', () => ({ identificarClienteProjuris: m.identificar }));
vi.mock('@/lib/projuris/consultas.server', () => ({ criarConsultasProjuris: () => ({ processosAtivos: m.processos, ultimosAndamentos: m.andamentos }) }));
vi.mock('@/lib/atendimento/processo-redacao.server', () => ({ redigirNoticiaProcesso: m.redigir }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: m.enviar }));
vi.mock('@/lib/atendimento/canais/ultramsg', () => ({ enviarTextoRevisora: m.revisora }));

function setup() {
  const fixture = conversas[0]; if (!fixture) throw new Error('Fixture missing');
  let saved: Conversa = { ...fixture, id: 'caso', etapa: 'ativo', modoIA: 'Automática', mensagens: [], agenteAna: {}, timeline: [] };
  let ws: unknown = defaultState; let rev = 0;
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const db = { rpc, from(table: string) {
    let many = false; let updating = false; let patch: Record<string, unknown> | undefined;
    const r = () => {
      if (updating && patch) { if (table === 'casos') saved = patch['dados'] as Conversa; else ws = patch['dados']; rev++; }
      const row = { id: 'caso', owner_id: 'owner', dados: saved, updated_at: String(rev) };
      return { error: null, data: updating ? [{ id: 'caso', owner_id: 'owner' }] : table === 'casos' ? many ? [row] : row : table === 'office_workspace' ? { dados: ws, updated_at: String(rev) } : table === 'checklist_itens' ? [] : table === 'atendimento_canal_config' ? { canal_ativo: 'ultramsg', agente_ativo: true, modo_teste: true } : { contato_externo: '5511999600306', telefone_ficticio: '5511999600306', status: 'liberado' } };
    };
    const q = { select: () => q, eq: () => q, order: () => q, range: () => { many = true; return q; }, update: (v: Record<string, unknown>) => { updating = true; patch = v; return q; }, insert: (v: Record<string, unknown>) => { updating = true; patch = v; return q; }, single: async () => r(), maybeSingle: async () => r(), then: (resolve: (v: ReturnType<typeof r>) => unknown) => Promise.resolve(r()).then(resolve) };
    return q;
  } } as unknown as SupabaseClient<Database>;
  let n = 0;
  return { db, rpc, get saved() { return saved; }, patch(fn: (c: Conversa) => Conversa) { saved = fn(saved); }, async message(texto: string) {
    const id = `ultramsg:5511999600306:${++n}`;
    saved = { ...saved, mensagens: [...saved.mensagens, { id, de: 'cliente', canal: 'ultramsg', texto, hora: '10:00' }] };
    await processarAna(db, 'caso', id, new Request('http://localhost:8080'));
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('REVISORA_WHATSAPP', '5511988887777');
  m.gerar.mockResolvedValue({ acao: 'enviar', mensagem: 'Números e fatos não aprovados', motivo_aprovacao: '', intencao: 'consulta_processo', urgente: false, encaminhar_humano: true, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '' });
  m.identificar.mockResolvedValue({ tipo: 'unico', pessoa: { codigo: 1, nome: 'Cliente Teste' } });
  m.processos.mockResolvedValue([{ codigo: 10, numero: '1234567-00.2026.8.26.0001', assunto: 'Divórcio', segredoJustica: false }]);
  m.andamentos.mockResolvedValue([{ codigo: 11, data: '29/10/2026', descricao: 'Movimentação pública' }]);
  m.redigir.mockResolvedValue('Seu processo tem movimentação pública registrada.');
  m.enviar.mockResolvedValue({ simulado: false, idExterno: 'envio' }); m.revisora.mockResolvedValue({ ok: true });
});

describe('Consulta processual real, com provedores substituídos', () => {
  it('consulta, registra pedido na conversa e não envia nenhum fato sem aprovação', async () => {
    const h = setup(); await h.message('Como está meu processo?');
    expect(m.identificar).toHaveBeenCalledWith('5511999600306');
    expect(m.processos).toHaveBeenCalledWith(1); expect(m.andamentos).toHaveBeenCalledWith(10);
    expect(h.saved.agenteAna?.pedidosProcesso?.[0]?.status).toBe('pendente');
    expect(m.enviar).toHaveBeenCalledTimes(1); expect(m.enviar.mock.calls[0]?.[0].texto).toBe(TEXTOS_CONSULTA.aviso);
    expect(m.revisora).toHaveBeenCalledWith(expect.stringContaining('AND-0001'));
    expect(h.rpc.mock.calls.every(c => !JSON.stringify(c).includes('Cliente Teste') && !JSON.stringify(c).includes('1234567-00'))).toBe(true);
  });
  it('?? pendente recebe conferência antes de mensagem curta ou modelo, sem nova consulta', async () => {
    const h = setup(); await h.message('Como está meu processo?'); m.gerar.mockClear(); m.identificar.mockClear(); m.enviar.mockClear();
    await h.message('??'); expect(m.gerar).not.toHaveBeenCalled(); expect(m.identificar).not.toHaveBeenCalled();
    expect(m.enviar.mock.calls[0]?.[0].texto).toBe(TEXTOS_CONSULTA.emConferencia);
  });
  it('aprova somente o texto vinculado ao hash e impede replay', async () => {
    const h = setup(); await h.message('Como está meu processo?'); const p = h.saved.agenteAna?.pedidosProcesso?.[0]; if (!p) throw new Error('No request');
    await decidirPedidoProcesso(h.db, 'caso', { acao: 'aprovar', codigo: p.codigo }, 'senior', 'manager', p.hash);
    expect(m.enviar.mock.calls.at(-1)?.[0].texto).toBe(p.textoProposto);
    await expect(decidirPedidoProcesso(h.db, 'caso', { acao: 'aprovar', codigo: p.codigo }, 'senior', 'manager', p.hash)).rejects.toThrow();
    expect(m.enviar).toHaveBeenCalledTimes(2);
  });
  it('hash alterado não permite enviar', async () => {
    const h = setup(); await h.message('Como está meu processo?'); h.patch(c => ({ ...c, agenteAna: { ...c.agenteAna, pedidosProcesso: c.agenteAna?.pedidosProcesso?.map(p => ({ ...p, textoProposto: 'Alterado' })) } }));
    await expect(decidirPedidoProcesso(h.db, 'caso', { acao: 'aprovar', codigo: 'AND-0001' }, 'senior', 'manager')).rejects.toThrow('hash'); expect(m.enviar).toHaveBeenCalledTimes(1);
  });
  it('revisora configurada corrige para o cliente daquele pedido', async () => {
    const h = setup(); await h.message('Como está meu processo?');
    expect(await receberRevisora(h.db, '5511988887777', 'corrigir AND-0001: Texto revisado')).toBe(true);
    expect(h.saved.agenteAna?.pedidosProcesso?.[0]?.status).toBe('corrigido');
    expect(m.enviar.mock.calls.at(-1)?.[0]).toMatchObject({ conversaId: 'caso', texto: 'Texto revisado', contatoEsperado: '5511999600306' });
  });
  it('recusa pausa Ana sem enviar dados e remetente estranho nunca decide', async () => {
    const h = setup(); await h.message('Como está meu processo?');
    expect(await receberRevisora(h.db, '5511977775555', 'ok AND-0001')).toBe(false);
    await receberRevisora(h.db, '5511988887777', 'não AND-0001');
    expect(h.saved.agenteAna?.humano).toBe(true); expect(m.enviar).toHaveBeenCalledTimes(1);
  });
  it('lembrete após 30 min, máximo três e aviso após 60 min são idempotentes', async () => {
    const h = setup(); await h.message('Como está meu processo?'); const p = h.saved.agenteAna?.pedidosProcesso?.[0]; if (!p) throw new Error('No request');
    m.revisora.mockClear(); m.enviar.mockClear();
    for (const min of [30, 30, 60, 60, 90, 120]) await executarPendenciasProcesso(h.db, new Date(Date.parse(p.criadoEm) + min * 60000));
    expect(m.revisora).toHaveBeenCalledTimes(3); expect(m.enviar).toHaveBeenCalledTimes(1);
    expect(h.saved.agenteAna?.pedidosProcesso?.[0]?.lembretesEm).toHaveLength(3);
  });
  it('telefone duplicado não consulta processos nem revela dados', async () => {
    const h = setup(); m.identificar.mockResolvedValue({ tipo: 'duplicado', codigos: [1, 2] }); await h.message('Como está meu processo?');
    expect(m.processos).not.toHaveBeenCalled(); expect(h.saved.agenteAna?.humano).toBe(true); expect(h.saved.agenteAna?.pedidosProcesso).toBeUndefined();
  });
  it('sênior/admin autorizam; júnior, atendente e operações não autorizam', () => {
    for (const role of ['admin', 'advogada_senior']) expect(respostaAutorizada({ canal: 'manager', papeis: [role] }, undefined)).toBe(true);
    for (const role of ['advogado_junior', 'atendente', 'operacoes']) expect(respostaAutorizada({ canal: 'manager', papeis: [role] }, undefined)).toBe(false);
  });
});