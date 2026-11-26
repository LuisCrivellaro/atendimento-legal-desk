import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';
import { ITENS_T09, comItensT09, itensNovosT09 } from '@/lib/atendimento/checklist-trabalhista';
import { executarChecklistT09 } from '@/lib/atendimento/checklist-trabalhista.server';
import { TEMPLATES_OFICIAIS } from '@/lib/atendimento/biblioteca/mensagens-oficiais';

const mocks = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

/** Checklist trabalhista oficial (T09) por autorização da equipe. Dados fictícios; canal simulado. */
const base = conversas[0] as Conversa;

function criarDb(c: Conversa, opts: { contato?: string | null; checklistAprovado?: boolean; itens?: string[] } = {}) {
  let dados = JSON.parse(JSON.stringify(c)) as Conversa;
  let rev = 0;
  const itens = [...(opts.itens ?? ['RG ou CNH', 'CPF', 'Comprovante de endereço'])].map((nome, ordem) => ({ nome, ordem, recebido: false }));
  const inseridos: string[] = [];
  const audit: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      let patch: { dados: Conversa } | undefined;
      let insert: { nome: string }[] | undefined;
      const exec = () => {
        if (table === 'casos') {
          if (patch) { dados = JSON.parse(JSON.stringify(patch.dados)) as Conversa; rev++; return { error: null, data: [{ id: c.id }] }; }
          return { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa, updated_at: String(rev) } };
        }
        if (table === 'office_workspace') return { error: null, data: { dados: defaultState } };
        if (table === 'atendimento_canal_config') return { error: null, data: { canal_ativo: 'ultramsg', agente_ativo: true } };
        if (table === 'atendimento_contatos_teste') return { error: null, data: opts.contato === null ? null : { contato_externo: opts.contato ?? '5511900000009' } };
        if (table === 'checklist_itens') {
          if (insert) { for (const i of insert) { inseridos.push(i.nome); itens.push({ nome: i.nome, ordem: itens.length, recebido: false }); } return { error: null, data: null }; }
          return { error: null, data: itens.map(i => ({ nome: i.nome })) };
        }
        return { error: null, data: null };
      };
      const q = {
        select: () => q, eq: () => q,
        update: (v: { dados: Conversa }) => { patch = v; return q; },
        insert: (v: { nome: string }[]) => { insert = v; return q; },
        single: async () => exec(), maybeSingle: async () => exec(),
        then: (res: (v: unknown) => unknown) => Promise.resolve(exec()).then(res),
      };
      return q;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === 'material_status') return { error: null, data: { checklist: !!opts.checklistAprovado, draft: false } };
      audit.push(args);
      return { error: null };
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => dados, inseridos, audit };
}

const conversa = (extra: Partial<Conversa> = {}): Conversa => ({ ...base, id: 'c-t09', modoIA: 'Automática', etapa: 'documentos', mensagens: [], timeline: [], documentos: [{ nome: 'RG ou CNH', recebido: true }, { nome: 'CPF', recebido: false }], agenteAna: {}, ...extra });

beforeEach(() => { mocks.enviar.mockReset(); mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-t09' }); });

describe('checklist trabalhista oficial (T09)', () => {
  it('itens estruturados sem duplicar (sem acento/maiúsculas) e sem desmarcar os recebidos', () => {
    expect(itensNovosT09(['extrato do fgts', 'CTPS (PÁGINAS DO CONTRATO E ANOTAÇÕES)'])).toHaveLength(ITENS_T09.length - 2);
    const docs = comItensT09([{ nome: 'Extrato do FGTS', recebido: true }], ['Extrato do FGTS', 'TRCT (se recebeu)']);
    expect(docs).toEqual([{ nome: 'Extrato do FGTS', recebido: true }, { nome: 'TRCT (se recebeu)', recebido: false }]);
  });

  it('autorizado pela equipe: envia o texto oficial exato, inclui os itens no checklist, marca o caso como trabalhista; nunca repete', async () => {
    const { db, ler, inseridos } = criarDb(conversa());
    const r = await executarChecklistT09(db, { conversaId: 'c-t09', ownerId: 'owner-1', autor: 'Dra. Carolina' });
    expect(r).toEqual({ ok: true, itens: ITENS_T09.length, checklistAprovado: false });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0]).toMatchObject({ motivo: 'checklist_trabalhista', contatoEsperado: '5511900000009', texto: TEMPLATES_OFICIAIS.T09.texto });
    expect(inseridos).toEqual([...ITENS_T09]);
    const c = ler();
    expect(c.etiquetaAcao).toBe('RT');
    expect(c.agenteAna?.checklistTrabalhista).toMatchObject({ autorizadoPor: 'Dra. Carolina', idExterno: 'wamid-t09', itens: [...ITENS_T09] });
    expect(c.mensagens.at(-1)?.modeloOficial).toEqual({ id: 'T09', versao: 1 });
    expect(c.documentos.find(d => d.nome === 'RG ou CNH')?.recebido).toBe(true);
    await expect(executarChecklistT09(db, { conversaId: 'c-t09', ownerId: 'owner-1', autor: 'Dra. Carolina' })).rejects.toThrow(/já foi enviado/);
    expect(mocks.enviar).toHaveBeenCalledOnce();
  });

  it('checklist já aprovado pela Dra.: o texto sai, mas os itens aprovados não são alterados', async () => {
    const { db, inseridos } = criarDb(conversa(), { checklistAprovado: true });
    expect(await executarChecklistT09(db, { conversaId: 'c-t09', ownerId: 'owner-1', autor: 'Dra.' })).toMatchObject({ itens: 0, checklistAprovado: true });
    expect(inseridos).toEqual([]);
  });

  it('sem contato liberado ou conversa desligada: nada sai', async () => {
    const semContato = criarDb(conversa(), { contato: null });
    await expect(executarChecklistT09(semContato.db, { conversaId: 'c-t09', ownerId: 'owner-1', autor: 'Dra.' })).rejects.toThrow(/não está liberado/);
    const desligada = criarDb(conversa({ modoIA: 'Desligada' }));
    await expect(executarChecklistT09(desligada.db, { conversaId: 'c-t09', ownerId: 'owner-1', autor: 'Dra.' })).rejects.toThrow(/bloqueada/);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('falha do WhatsApp: sem recibo nada vira "enviado", o checklist não muda e não há reenvio automático', async () => {
    mocks.enviar.mockRejectedValueOnce(new Error('timeout'));
    const { db, ler, inseridos, audit } = criarDb(conversa());
    await expect(executarChecklistT09(db, { conversaId: 'c-t09', ownerId: 'owner-1', autor: 'Dra.' })).rejects.toThrow(/não confirmado/);
    expect(ler().agenteAna?.checklistTrabalhista?.falhouEm).toBeTruthy();
    expect(ler().agenteAna?.checklistTrabalhista?.enviadoEm).toBeUndefined();
    expect(inseridos).toEqual([]);
    expect(audit.some(a => a['p_status'] === 'erro')).toBe(true);
    await expect(executarChecklistT09(db, { conversaId: 'c-t09', ownerId: 'owner-1', autor: 'Dra.' })).rejects.toThrow(/já foi enviado/);
    expect(mocks.enviar).toHaveBeenCalledOnce();
  });
});
