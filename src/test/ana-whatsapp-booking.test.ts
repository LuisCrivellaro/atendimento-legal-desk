import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { processarAna } from '@/lib/atendimento/ana.server';
import { conversas } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), reservar: vi.fn(), enviar: vi.fn() }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/google-calendar.server', () => ({ reservarGoogleCalendar: mocks.reservar }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

describe('reserva WhatsApp com telefone do canal', () => {
  it('reserva com telefone do remetente sem precisar de telefone escrito pelo cliente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T04:06:00Z'));
    try {
      const fixture = conversas[0];
      if (!fixture) throw new Error('Fixture missing');
      const telefone = '5511999600306';
      const inicio = '2026-10-26T12:00:00.000Z';
      const messageId = `ultramsg:${telefone}:escolha-1`;
      let saved = {
        ...fixture, consultaAgendada: undefined, modoIA: 'Automática', tipoClienteAgenda: 'novo',
        agenteAna: { apresentado: true, agendaReal: true, horariosTeste: [inicio], dados: { nome: 'Maria Teste', cpf: '', assunto: 'Consulta', email: '' } },
        mensagens: [{ id: messageId, de: 'cliente', canal: 'ultramsg', texto: '26/10 às 9h', hora: '01:06' }],
      };
      const config = { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true };
      const contato = { contato_externo: telefone, status: 'liberado' };
      const db = {
        from(table: string) {
          let patch: { dados: typeof saved } | undefined;
          let updating = false;
          const result = () => {
            if (table === 'casos') {
              if (patch) saved = patch.dados;
              return { error: null, data: updating ? [{ id: 'caso-teste' }] : { owner_id: 'owner-teste', dados: saved, updated_at: 'revision' } };
            }
            return { error: null, data: table === 'office_workspace' ? { dados: defaultState } : table === 'atendimento_canal_config' ? config : contato };
          };
          const query = {
            select: () => query, eq: () => query,
            update: (value: { dados: typeof saved }) => { patch = value; updating = true; return query; },
            single: async () => result(), maybeSingle: async () => result(),
            then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
          };
          return query;
        },
        rpc: async () => ({ error: null }),
      };
      mocks.gerar.mockResolvedValue({ acao: 'enviar', mensagem: '', motivo_aprovacao: '', intencao: 'agendamento', urgente: false, encaminhar_humano: false, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '' });
      mocks.reservar.mockResolvedValue({ id: 'evento-teste', inicio });
      mocks.enviar.mockResolvedValue({ simulado: false, idExterno: 'envio-teste' });
      await processarAna(db as unknown as SupabaseClient<Database>, 'caso-teste', messageId, new Request('http://localhost:8080'));
      expect(mocks.gerar.mock.calls[0]?.[1].telefone_informado).toBe('5511999600306');
      expect(mocks.reservar).toHaveBeenCalledWith('caso-teste', inicio, expect.any(Date), { nome: 'Maria Teste', telefone: '5511999600306', tipo: 'novo' });
      expect(saved.consultaAgendada).toBe(inicio);
      expect(mocks.enviar).toHaveBeenCalledOnce();
      expect(saved.mensagens.at(-1)?.de).toBe('escritorio');
    } finally {
      vi.useRealTimers();
    }
  });
});