import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState, type OfficeState } from '@/lib/office';
import { enviarEncerramentoProcesso } from '@/lib/atendimento/acompanhamento.server';
import { PERGUNTA_ENCERRAMENTO } from '@/lib/atendimento/acompanhamento';
import { aplicarModo } from '@/lib/atendimento/secretaria/modos';

const mocks = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

/**
 * Atendimento híbrido nas automações do acompanhamento (dados fictícios, canal simulado): a equipe assumir a conversa
 * não bloqueia automações autorizadas; Humano/Bloqueado nunca enviam; texto fora da biblioteca só sai aprovado.
 */
const CONTATO = '5511900000003';
const base = conversas[0] as Conversa;
const APROVADO = { ...defaultState, secretaria: { ativa: true, aprovacoesTexto: { pergunta_encerramento: { texto: PERGUNTA_ENCERRAMENTO.texto } } } } as OfficeState;

function criarDb(c: Conversa, workspace: OfficeState) {
  let dados = JSON.parse(JSON.stringify(c)) as Conversa;
  let rev = 0;
  const db = {
    from(table: string) {
      let patch: { dados: Conversa } | undefined;
      const exec = () => {
        if (table === 'office_workspace') return { error: null, data: { dados: workspace } };
        if (table === 'casos') {
          if (patch) { dados = JSON.parse(JSON.stringify(patch.dados)) as Conversa; rev++; return { error: null, data: [{ id: c.id }] }; }
          return { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa, updated_at: String(rev) } };
        }
        return { error: null, data: null };
      };
      const q = {
        select: () => q, eq: () => q,
        update: (v: { dados: Conversa }) => { patch = v; return q; },
        single: async () => exec(), maybeSingle: async () => exec(),
        then: (res: (v: unknown) => unknown) => Promise.resolve(exec()).then(res),
      };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => dados };
}

const pedido = { codigo: 'AND-0001' };
const conversa = (agente: Partial<NonNullable<Conversa['agenteAna']>> = {}): Conversa => ({ ...base, id: 'c-enc', modoIA: 'Automática', mensagens: [], timeline: [], avisosEquipe: [], agenteAna: { ...agente } });

beforeEach(() => { mocks.enviar.mockReset(); mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-enc' }); });

describe('pergunta de encerramento depois de notícia processual aprovada', () => {
  it('equipe no controle (Híbrido): sai uma vez, com reserva da automação, sem tirar a conversa da equipe', async () => {
    const { db, ler } = criarDb(conversa({ humano: true }), APROVADO);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar')).toBe(true);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar')).toBe(false);
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0]).toMatchObject({ motivo: 'encerramento_processo', automacaoId: 'encerramento_processo:AND-0001', texto: PERGUNTA_ENCERRAMENTO.texto });
    expect(ler().agenteAna?.humano).toBe(true);
    expect(ler().agenteAna?.secretaria?.envio).toBeUndefined();
  });

  it('texto não aprovado pela Dra.: nada sai; aviso com texto pronto (uma vez)', async () => {
    const { db, ler } = criarDb(conversa(), defaultState);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar')).toBe(false);
    await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar');
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ler().avisosEquipe?.filter(a => a.id === 'encerramento-aprovacao:AND-0001')).toHaveLength(1);
  });

  it('modos Humano e Bloqueado: nada sai; equipe recebe o texto pronto', async () => {
    for (const modo of ['humano', 'bloqueado'] as const) {
      const { db, ler } = criarDb(aplicarModo(conversa(), modo, { tipo: 'equipe' }), APROVADO);
      expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar')).toBe(false);
      expect(ler().avisosEquipe?.find(a => a.id === 'encerramento-nao-enviado:AND-0001')?.textoPronto).toBe(PERGUNTA_ENCERRAMENTO.texto);
    }
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('permissão "Acompanhamento de comunicações aprovadas" desligada: nada sai', async () => {
    const off = { ...APROVADO, secretaria: { ...(APROVADO as unknown as { secretaria: object }).secretaria, permissoes: { acompanhamento_aprovado: 'desligado' } } } as OfficeState;
    const { db } = criarDb(conversa(), off);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar')).toBe(false);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('secretaria desligada: regra anterior (equipe no controle não recebe a pergunta)', async () => {
    const off = { ...APROVADO, secretaria: { ...(APROVADO as unknown as { secretaria: object }).secretaria, ativa: false } } as OfficeState;
    const { db } = criarDb(conversa({ humano: true }), off);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar')).toBe(false);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('recusa, lista de processos ou aviso de audiência/perícia nunca recebem a pergunta', async () => {
    const { db } = criarDb(conversa(), APROVADO);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'recusar')).toBe(false);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, { ...pedido, evento: { tipo: 'audiencia', chave: 'x' } } as never, 'aprovar')).toBe(false);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('modo de teste: contato fora do número autorizado não recebe', async () => {
    const teste = { ...APROVADO, secretaria: { ...(APROVADO as unknown as { secretaria: object }).secretaria, testeAutomacoes: { ativo: true, numero: '5511988887777' } } } as OfficeState;
    const { db } = criarDb(conversa(), teste);
    expect(await enviarEncerramentoProcesso(db, 'c-enc', CONTATO, pedido, 'aprovar')).toBe(false);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});
