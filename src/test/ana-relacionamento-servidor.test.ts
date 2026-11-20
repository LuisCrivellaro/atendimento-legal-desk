import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa, Mensagem } from '@/lib/mock-data';
import { conversas } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';
import { processarAna } from '@/lib/atendimento/ana.server';
import { reconhecerRelacionamentoAna } from '@/lib/atendimento/ana-relacionamento.server';
const mocks = vi.hoisted(() => ({ indice: vi.fn(), ativos: vi.fn(), gerar: vi.fn(), enviar: vi.fn(), agenda: vi.fn(), fluxo: vi.fn(), base: vi.fn() }));
vi.mock('@/lib/projuris/indice.server', () => ({ identificarClienteProjuris: mocks.indice }));
vi.mock('@/lib/projuris/consultas.server', () => ({ criarConsultasProjuris: () => ({ processosAtivos: mocks.ativos }) }));
vi.mock('@/lib/projuris/base.server', () => ({ lerBase: mocks.base }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));
vi.mock('@/lib/atendimento/projuris-agenda.server', () => ({ ocupadosAgenda: mocks.agenda, reservarAgenda: mocks.agenda }));
vi.mock('@/lib/atendimento/consulta-processo.server', () => ({ fluxoProcessoReal: mocks.fluxo }));
afterEach(() => vi.useRealTimers());
function setup(extra: Partial<Conversa> = {}) {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T12:50:00Z'));
  const fixture = conversas[0]; if (!fixture) throw new Error('Fixture ausente');
  const { contrato: _contrato, ...limpa } = fixture;
  let saved: Conversa = { ...limpa, telefone: '5511990000001', etapa: 'inicial', processos: [], consultaAgendada: undefined, tipoClienteAgenda: 'novo', modoIA: 'Automática', mensagens: [], timeline: [], agenteAna: {}, ...extra };
  mocks.base.mockResolvedValue({ base: undefined });
  mocks.indice.mockResolvedValue({ tipo: 'unico', pessoa: { codigo: 101, nome: 'Cliente Teste' } });
  mocks.ativos.mockResolvedValue([{ codigo: 1001 }]);
  mocks.fluxo.mockResolvedValue(false); mocks.enviar.mockResolvedValue({ simulado: false, idExterno: 'enviado' });
  mocks.gerar.mockResolvedValue({ acao: 'enviar', mensagem: 'Recebi o vídeo. Consulta inicial gratuita de 30 minutos. Qual dos horários que enviei prefere?', motivo_aprovacao: '', intencao: 'novo_caso', urgente: false, encaminhar_humano: false, dados_coletados: { nome: '', cpf: '', email: '', assunto: '' }, proximo_passo: '' });
  const db = { from(table: string) {
    let patch: { dados: Conversa } | undefined; let update = false;
    const result = () => {
      if (table === 'casos') { if (patch) saved = patch.dados; return { error: null, data: update ? [{ id: saved.id }] : { owner_id: 'owner', dados: saved, updated_at: 'rev' } }; }
      return { error: null, data: table === 'office_workspace' ? { dados: defaultState } : table === 'checklist_itens' ? [] : table === 'atendimento_canal_config' ? { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true } : { contato_externo: saved.telefone, status: 'liberado' } };
    };
    const query = { select: () => query, eq: () => query, update: (value: { dados: Conversa }) => { patch = value; update = true; return query; }, single: async () => result(), maybeSingle: async () => result(), then: (resolve: (v: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) }; return query;
  }, rpc: async () => ({ error: null }) } as unknown as SupabaseClient<Database>;
  return { db, get saved() { return saved; }, async receber(tipo: NonNullable<Mensagem['tipo']>, texto = '', arquivo?: string) {
    const id = `ultramsg:${saved.telefone}:1`;
    saved = { ...saved, mensagens: [...saved.mensagens, { id, de: 'cliente', canal: 'ultramsg', tipo, texto, hora: '', dataHora: new Date().toISOString(), ...(arquivo ? { arquivo } : {}) }] };
    await processarAna(db, saved.id, id, new Request('http://localhost:8080'));
  } };
}
describe('fluxo central de reconhecimento com integrações substituídas', () => {
  it.each(['video', 'imagem', 'documento'] as const)('ativo envia %s sem agenda e material permanece na conversa', async tipo => {
    const h = setup(); await h.receber(tipo, '', 'prova');
    expect(mocks.indice).toHaveBeenCalledWith('5511990000001'); expect(mocks.ativos).toHaveBeenCalledWith(101);
    expect(mocks.agenda).not.toHaveBeenCalled(); expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(h.saved.agenteAna?.resultado?.intencao).toBe('documento'); expect(h.saved.mensagens[0]?.arquivo).toBe('prova');
    expect(mocks.gerar.mock.calls[0]?.[1].relacionamento.consultaInicial).toBe(false);
    expect(mocks.gerar.mock.calls[0]?.[1].consulta_info).toEqual({ tipo: 'acompanhamento', reserva_confirmada: null });
  });
  it('áudio ativo não consulta identidade, não gera nem envia', async () => {
    const h = setup(); await h.receber('audio', '', 'voz');
    expect(mocks.indice).not.toHaveBeenCalled(); expect(mocks.gerar).not.toHaveBeenCalled(); expect(mocks.enviar).not.toHaveBeenCalled(); expect(h.saved.mensagens[0]?.tipo).toBe('audio');
  });
  it('pergunta factual usa exclusivamente o fluxo revisado existente', async () => {
    const h = setup(); mocks.gerar.mockResolvedValueOnce({ ...await mocks.gerar(), intencao: 'consulta_processo' }); mocks.fluxo.mockResolvedValueOnce(true);
    await h.receber('texto', 'Como está meu processo?');
    expect(mocks.fluxo).toHaveBeenCalledWith(h.db, expect.objectContaining({ owner: 'owner', telefone: '5511990000001', intencao: 'consulta_processo' })); expect(mocks.enviar).not.toHaveBeenCalled(); expect(mocks.agenda).not.toHaveBeenCalled();
  });
  it('cliente fora da coorte é reconhecido sem depender da lista filtrada', async () => {
    const h = setup(); const r = await reconhecerRelacionamentoAna(h.db, 'owner', h.saved, h.saved.telefone, 'ultramsg');
    expect(r.rel.situacao).toBe('ativo'); expect(r.rel.consultaInicial).toBe(false);
  });
  it('duplicidade fora da coorte bloqueia leitura de processos', async () => {
    const h = setup(); mocks.indice.mockResolvedValueOnce({ tipo: 'duplicado', codigos: [101, 102] });
    const r = await reconhecerRelacionamentoAna(h.db, 'owner', h.saved, h.saved.telefone, 'ultramsg');
    expect(r.rel.situacao).toBe('incerto'); expect(mocks.ativos).not.toHaveBeenCalled(); expect(r.nome).toBe('');
  });
  it('falha oficial com contato novo sem histórico segue para a saudação gratuita', async () => {
    const h = setup(); mocks.indice.mockRejectedValueOnce(new Error('Indisponível'));
    const r = await reconhecerRelacionamentoAna(h.db, 'owner', h.saved, h.saved.telefone, 'ultramsg');
    expect(r.rel.situacao).toBe('novo_lead'); expect(r.rel.consultaInicial).toBe(true);
  });
  it('falha oficial não transforma ausente local com histórico da equipe em lead', async () => {
    const h = setup({ mensagens: [{ id: 'e1', de: 'escritorio', canal: 'ultramsg', texto: 'Olá', hora: '', dataHora: '2026-11-01T12:00:00Z' }] }); mocks.indice.mockRejectedValueOnce(new Error('Indisponível'));
    const r = await reconhecerRelacionamentoAna(h.db, 'owner', h.saved, h.saved.telefone, 'ultramsg');
    expect(r.rel.situacao).toBe('incerto'); expect(r.rel.consultaInicial).toBe(false);
  });
  it('controle humano impede qualquer leitura e resposta', async () => {
    const h = setup({ agenteAna: { humano: true } }); await h.receber('video', '', 'prova');
    expect(mocks.indice).not.toHaveBeenCalled(); expect(mocks.enviar).not.toHaveBeenCalled();
  });
});