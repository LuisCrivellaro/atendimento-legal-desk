import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { processarAna } from '@/lib/atendimento/ana.server';
import { conversas, type Conversa, type Mensagem } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), enviar: vi.fn() }));
vi.mock('@/lib/atendimento/ana-relacionamento.server', () => ({ reconhecerRelacionamentoAna: async () => ({ identidade: { tipo: 'nao_encontrado' }, rel: { situacao: 'em_atendimento', consultaInicial: false, quantidadeProcessos: 0 }, nome: '' }) }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));
vi.mock('@/lib/atendimento/consulta-processo.server', () => ({ fluxoProcessoReal: async () => false, enviarAvisoProcesso: vi.fn() }));
vi.mock('@/lib/atendimento/projuris-agenda.server', () => ({ ocupadosAgenda: async () => [], reservarAgenda: vi.fn(), remarcarAgenda: vi.fn(), cancelarAgenda: vi.fn() }));

// Dados fictícios: conversa depois do Trato feito, com checklist real (tabela checklist_itens).
const telefone = '5511900000003';
const fixture = conversas[1];
if (!fixture) throw new Error('fixture');
const base: Conversa = fixture;

function cenario(nova: Partial<Mensagem>, itens: { nome: string; recebido: boolean }[]) {
  const messageId = `ultramsg:${telefone}:doc-1`;
  let saved: Conversa = {
    ...base, id: 'caso-col', modoIA: 'Automática', etapa: 'documentos', tipoClienteAgenda: 'novo',
    timeline: [{ data: '2026-11-24T12:00:00Z', evento: 'Trato feito · pasta X · documentos base pedidos' }],
    agenteAna: { apresentado: true, telefone, dados: { nome: 'Rogério Teste', cpf: '', assunto: '', email: '' } },
    mensagens: [{ id: messageId, de: 'cliente', canal: 'ultramsg', texto: '', hora: '10:00', dataHora: '2026-11-25T13:00:00.000Z', ...nova }],
  };
  const tabelas: Record<string, unknown> = { checklist_itens: itens, office_workspace: { dados: defaultState }, atendimento_canal_config: { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true }, atendimento_contatos_teste: { contato_externo: telefone, telefone_ficticio: telefone, status: 'liberado' } };
  const db = {
    from(table: string) {
      let patch: { dados: Conversa } | undefined;
      const result = () => {
        if (table === 'casos') {
          if (patch) { saved = JSON.parse(JSON.stringify(patch.dados)) as Conversa; return { error: null, data: [{ id: 'caso-col' }] }; }
          return { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(saved)) as Conversa, updated_at: 'rev' } };
        }
        return { error: null, data: tabelas[table] ?? null };
      };
      const q = { select: () => q, eq: () => q, update: (v: { dados: Conversa }) => { patch = v; return q; }, single: async () => result(), maybeSingle: async () => result(), then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res) };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => saved, messageId };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T13:00:30.000Z'));
  mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-doc' });
  mocks.gerar.mockResolvedValue({ acao: 'enviar', mensagem: 'Recebemos seu documento, está ótimo!', motivo_aprovacao: '', intencao: 'documento', urgente: false, encaminhar_humano: false, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '' });
});
afterEach(() => { vi.useRealTimers(); });

const itens = [{ nome: 'RG ou CNH', recebido: true }, { nome: 'CPF', recebido: false }, { nome: 'Comprovante de endereço', recebido: false }];

describe('P0-3 · Anne acusa o recebimento só com recibo do servidor', () => {
  it('anexo guardado (recibo): acusa e lista os faltantes reais do checklist, sem avaliar o documento', async () => {
    const { db, ler, messageId } = cenario({ tipo: 'documento', arquivo: 'rg.pdf', path: 'owner-1/caso-col/x/rg.pdf', salvoStart: true }, itens);
    await processarAna(db, 'caso-col', messageId, new Request('http://localhost'));
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toBe('Recebi o seu arquivo, obrigada! 😊\nA equipe vai conferir.\n\nAinda faltam:\n• CPF\n• Comprovante de endereço');
    expect(ler().agenteAna?.humano).toBe(false);
  });
  it('anexo sem recibo (download falhou): nunca diz que recebeu e passa para a equipe', async () => {
    const { db, ler, messageId } = cenario({ tipo: 'documento', arquivo: '[arquivo recebido pelo WhatsApp]' }, itens);
    await processarAna(db, 'caso-col', messageId, new Request('http://localhost'));
    const texto = mocks.enviar.mock.calls[0]?.[0].texto as string;
    expect(texto).not.toMatch(/recebi|recebemos/i);
    expect(ler().agenteAna?.humano).toBe(true);
  });
  it('"esse documento serve?": a equipe avalia', async () => {
    const { db, ler, messageId } = cenario({ texto: 'esse documento que mandei serve?' }, itens);
    await processarAna(db, 'caso-col', messageId, new Request('http://localhost'));
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toMatch(/Quem confere se o documento atende é a equipe/);
    expect(ler().agenteAna?.humano).toBe(true);
  });
});
