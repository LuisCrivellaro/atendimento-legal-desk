import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { processarAna } from '@/lib/atendimento/ana.server';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), enviar: vi.fn(), cancelar: vi.fn(), remarcar: vi.fn(), reservar: vi.fn(), ocupados: vi.fn() }));
vi.mock('@/lib/atendimento/ana-relacionamento.server', () => ({ reconhecerRelacionamentoAna: async () => ({ identidade: { tipo: 'nao_encontrado' }, rel: { situacao: 'novo_lead', consultaInicial: true, quantidadeProcessos: 0 }, nome: '' }) }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));
vi.mock('@/lib/atendimento/consulta-processo.server', () => ({ fluxoProcessoReal: async () => false, enviarAvisoProcesso: vi.fn() }));
vi.mock('@/lib/atendimento/projuris-agenda.server', () => ({
  cancelarAgenda: (...a: unknown[]) => (mocks.cancelar as (...x: unknown[]) => unknown)(...a),
  remarcarAgenda: (...a: unknown[]) => (mocks.remarcar as (...x: unknown[]) => unknown)(...a),
  reservarAgenda: (...a: unknown[]) => (mocks.reservar as (...x: unknown[]) => unknown)(...a),
  ocupadosAgenda: (...a: unknown[]) => (mocks.ocupados as (...x: unknown[]) => unknown)(...a),
}));

// Dados fictícios. Consulta hoje (25/11/2026) às 14h30 de São Paulo; confirmação enviada às 13h45.
const telefone = '5511900000001';
const inicio = '2026-11-25T17:30:00.000Z';
const fixture = conversas[0];
if (!fixture) throw new Error('fixture');
const base: Conversa = fixture;

function cenario(texto: string): { db: SupabaseClient<Database>; ler: () => Conversa; messageId: string } {
  const messageId = `ultramsg:${telefone}:resp-1`;
  let saved: Conversa = {
    ...base, id: 'caso-conf', modoIA: 'Automática', tipoClienteAgenda: 'novo', consultaAgendada: inicio, timeline: [],
    agenteAna: {
      apresentado: true, telefone, tipoCliente: 'novo', dados: { nome: 'Maria Teste', cpf: '', assunto: 'Consulta', email: '' },
      reservaCalendar: { id: 'evt-1', inicio, fim: '2026-11-25T18:00:00.000Z' },
      // Lembrete das 08:00 já enviado: existe consentimento de cancelamento ligado a ele.
      lembreteConsulta: { inicio, enviadoEm: '2026-11-25T11:00:00.000Z' },
      confirmacaoCancelamento: { eventoId: 'evt-1', inicio, contato: telefone, expira: '2026-11-26T05:30:00.000Z' },
      confirmacao40: { inicio, reservadoEm: '2026-11-25T16:45:00.000Z', enviadoEm: '2026-11-25T16:45:00.000Z', idExterno: 'wamid-conf' },
    },
    mensagens: [
      { id: 'lembrete', de: 'escritorio', canal: 'ultramsg', texto: 'Lembrete das 8h', hora: '08:00', idExterno: 'wamid-lembrete', status: 'enviada' },
      { id: 'conf', de: 'escritorio', canal: 'ultramsg', texto: 'Olá\nBoa tarde ! 😊\n📍Passando para confirmar o seu atendimento hoje às 14h30, ok?!\nEquipe CS Advocacia ⚖️\nLawyers', hora: '13:45', idExterno: 'wamid-conf', status: 'enviada' },
      { id: messageId, de: 'cliente', canal: 'ultramsg', texto, hora: '13:47', dataHora: '2026-11-25T16:47:00.000Z' },
    ],
  };
  const config = { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true };
  const contato = { contato_externo: telefone, telefone_ficticio: telefone, status: 'liberado' };
  const db = {
    from(table: string) {
      let patch: { dados: Conversa } | undefined;
      const result = () => {
        if (table === 'casos') {
          if (patch) { saved = JSON.parse(JSON.stringify(patch.dados)) as Conversa; return { error: null, data: [{ id: 'caso-conf' }] }; }
          return { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(saved)) as Conversa, updated_at: 'rev' } };
        }
        return { error: null, data: table === 'checklist_itens' ? [] : table === 'office_workspace' ? { dados: defaultState } : table === 'atendimento_canal_config' ? config : contato };
      };
      const q = {
        select: () => q, eq: () => q,
        update: (v: { dados: Conversa }) => { patch = v; return q; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => saved, messageId };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T16:47:00.000Z'));
  mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-resp' });
  mocks.gerar.mockResolvedValue({ acao: 'enviar', mensagem: 'Entendi.', motivo_aprovacao: '', intencao: 'duvida_geral', urgente: false, encaminhar_humano: false, dados_coletados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' }, proximo_passo: '' });
});
afterEach(() => { vi.useRealTimers(); });

describe('resposta do cliente à confirmação de 40 min (servidor primeiro)', () => {
  it('7. "ok" registra presença e responde com o texto fixo', async () => {
    const { db, ler, messageId } = cenario('ok');
    await processarAna(db, 'caso-conf', messageId, new Request('http://localhost'));
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toBe('Presença confirmada! Sua consulta continua hoje, às 14h30.');
    const c = ler();
    expect(c.agenteAna?.confirmacao40).toMatchObject({ resposta: 'sim' });
    expect(c.agenteAna?.confirmacao40?.respondidoEm).toBeTruthy();
    expect(c.timeline.some(t => t.evento === 'Presença confirmada pelo cliente na confirmação de presença')).toBe(true);
    expect(c.consultaAgendada).toBe(inicio);
    expect(mocks.cancelar).not.toHaveBeenCalled();
  });
  it.each(['Não vou conseguir', 'não', 'vou atrasar'])('8. "%s" nunca cancela, mesmo com o consentimento do lembrete das 08:00', async texto => {
    const { db, ler, messageId } = cenario(texto);
    await processarAna(db, 'caso-conf', messageId, new Request('http://localhost'));
    expect(mocks.cancelar).not.toHaveBeenCalled();
    expect(mocks.remarcar).not.toHaveBeenCalled();
    const c = ler();
    expect(c.consultaAgendada).toBe(inicio);
    expect(c.agenteAna?.reservaCalendar?.id).toBe('evt-1');
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toMatch(/Deseja remarcar ou cancelar/);
    expect(c.agenteAna?.confirmacao40).toMatchObject({ resposta: 'nao' });
    expect(c.avisosEquipe?.some(a => a.prioridade && a.tipo === 'confirmacao40')).toBe(true);
  });
  it('"sim" depois de outra pergunta da Anne não vira presença confirmada', async () => {
    const { db, ler, messageId } = cenario('sim');
    const c = ler();
    // Sem lembrete das 08:00 neste cenário, para isolar a confirmação de 40 min.
    c.agenteAna = { ...c.agenteAna, lembreteConsulta: undefined, confirmacaoCancelamento: undefined };
    c.mensagens.splice(2, 0, { id: 'pergunta', de: 'escritorio', canal: 'ultramsg', texto: 'Quer mesmo cancelar a sua consulta?', hora: '13:46', idExterno: 'wamid-outra', status: 'enviada' });
    await processarAna(db, 'caso-conf', messageId, new Request('http://localhost'));
    expect(ler().agenteAna?.confirmacao40?.respondidoEm).toBeUndefined();
    expect(mocks.enviar.mock.calls[0]?.[0].texto).not.toBe('Presença confirmada! Sua consulta continua hoje, às 14h30.');
  });
});
