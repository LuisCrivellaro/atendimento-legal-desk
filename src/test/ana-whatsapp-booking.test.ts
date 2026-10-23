import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { processarAna } from '@/lib/atendimento/ana.server';
import { conversas } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), reservar: vi.fn(), enviar: vi.fn(), remarcar: vi.fn(), cancelar: vi.fn(), ocupados:vi.fn() }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/google-calendar.server', () => ({ reservarGoogleCalendar: mocks.reservar, remarcarGoogleCalendar:mocks.remarcar,cancelarGoogleCalendar:mocks.cancelar,ocupadosGoogleCalendar:mocks.ocupados }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

describe('reserva WhatsApp com telefone do canal', () => {
  it.each(['reservar','perguntar','cancelar','remarcar','ofertar'] as const)('fluxo WhatsApp: %s com telefone do remetente', async (cenario) => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T04:06:00Z'));
    try {
      const fixture = conversas[0];
      if (!fixture) throw new Error('Fixture missing');
      const telefone = '5511999600306';
      const inicio = '2026-10-26T12:00:00.000Z';
      const messageId = `ultramsg:${telefone}:escolha-1`;
      const anterior={id:'anavelho',inicio:'2026-10-27T12:00:00.000Z',fim:'2026-10-27T12:30:00.000Z'};
      const texto=cenario==='cancelar'?'Quero cancelar minha consulta':cenario==='perguntar'?'Quero agendar uma consulta':cenario==='ofertar'?'Quero agendar uma consulta':'26/10 às 9h';
      let saved = {
        ...fixture, consultaAgendada: undefined, modoIA: 'Automática', tipoClienteAgenda: 'novo',
        agenteAna: { apresentado: true, agendaReal: true, horariosTeste: [inicio], dados: { nome: 'Maria Teste', cpf: '', assunto: 'Consulta', email: '' } },
        ...(cenario!=='reservar'&&cenario!=='ofertar'?{consultaAgendada:anterior.inicio,agenteAna:{apresentado:true,agendaReal:true,horariosTeste:[inicio],dados:{nome:'Maria Teste',cpf:'',assunto:'Consulta',email:''},reservaCalendar:anterior,...(cenario==='remarcar'?{alteracaoConsulta:'remarcar',autorizacaoRemarcacao:{eventoId:anterior.id,inicio:anterior.inicio,contato:telefone,expira:'2026-10-23T05:06:00Z'}}:{})}}:{}),
        mensagens: [{ id: messageId, de: 'cliente', canal: 'ultramsg', texto, hora: '01:06' }],
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
            return { error: null, data: table === 'checklist_itens' ? [] : table === 'office_workspace' ? { dados: defaultState } : table === 'atendimento_canal_config' ? config : contato };
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
      mocks.gerar.mockResolvedValue({ acao: 'enviar', mensagem: 'Sua solicitação ficou registrada como prioridade para a equipe, que retorna no próximo dia útil a partir das 8h.', motivo_aprovacao: '', intencao: 'outro', urgente: false, encaminhar_humano: true, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '' });
      mocks.reservar.mockResolvedValue({ id: 'evento-teste', inicio });
      mocks.remarcar.mockResolvedValue({id:'evento-teste',inicio});
      mocks.cancelar.mockResolvedValue(undefined);
      mocks.ocupados.mockResolvedValue([{start:inicio,end:'2026-10-26T12:30:00.000Z'}]);
      mocks.enviar.mockResolvedValue({ simulado: false, idExterno: 'envio-teste' });
      await processarAna(db as unknown as SupabaseClient<Database>, 'caso-teste', messageId, new Request('http://localhost:8080'));
      expect(mocks.gerar.mock.calls[0]?.[1].telefone_informado).toBe('5511999600306');
      if(cenario==='reservar') {expect(mocks.reservar).toHaveBeenCalledWith('caso-teste', inicio, expect.any(Date), { nome: 'Maria Teste', telefone: '5511999600306', tipo: 'novo' });expect(saved.consultaAgendada).toBe(inicio);}
      if(cenario==='perguntar'){expect(mocks.reservar).not.toHaveBeenCalled();expect(mocks.cancelar).not.toHaveBeenCalled();expect(saved.consultaAgendada).toBe(anterior.inicio);}
      if(cenario==='cancelar'){expect(mocks.cancelar).toHaveBeenCalledWith('caso-teste',anterior,true);expect(saved.consultaAgendada).toBeUndefined();expect(saved.agenteAna.horariosTeste).toEqual([]);expect('reservaCalendar' in saved.agenteAna).toBe(false);}
      if(cenario==='remarcar'){expect(mocks.remarcar).toHaveBeenCalledWith('caso-teste',anterior,inicio,true,expect.any(Date),{nome:'Maria Teste',telefone,tipo:'novo'});expect(saved.consultaAgendada).toBe(inicio);}
      if(cenario==='ofertar'){expect(mocks.ocupados).toHaveBeenCalledOnce();expect(saved.agenteAna.horariosTeste).not.toContain(inicio);expect(mocks.reservar).not.toHaveBeenCalled();}
      expect(saved.agenteAna).toMatchObject({ humano: false });
      expect(mocks.enviar).toHaveBeenCalledOnce();
      expect(saved.mensagens.at(-1)?.de).toBe('escritorio');
    } finally {
      vi.useRealTimers();
    }
  });
});