import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState, type OfficeState } from '@/lib/office';
import { enviarConfirmacoesConsulta } from '@/lib/atendimento/confirmacao-consulta.server';
import { enviarLembretesConsulta } from '@/lib/atendimento/lembrete-consulta.server';
import { aplicarModo } from '@/lib/atendimento/secretaria/modos';

const mocks = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

// Dados fictícios. 25/11/2026 é quarta-feira; São Paulo = UTC-3. Nenhuma mensagem real é enviada (canal simulado).
const SP = (hhmm: string, dia = '2026-11-25') => new Date(`${dia}T${hhmm}:00-03:00`);
const iso = (hhmm: string, dia = '2026-11-25') => SP(hhmm, dia).toISOString();
const base = conversas[0] as Conversa;
const LIGADA: OfficeState = { ...defaultState, secretaria: { ativa: true } } as OfficeState;

function conversa(inicio: string, extra: Partial<Conversa> = {}, agente: Partial<NonNullable<Conversa['agenteAna']>> = {}): Conversa {
  return { ...base, id: 'c-conf', modoIA: 'Automática', consultaAgendada: inicio, mensagens: [], timeline: [], agenteAna: { reservaCalendar: { id: 'evt-1', inicio, fim: new Date(Date.parse(inicio) + 1800000).toISOString() }, dados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' }, telefone: '5511900000001', ...agente }, ...extra };
}

function criarDb(casos: Record<string, Conversa>, workspace: OfficeState) {
  const store = new Map(Object.entries(casos).map(([id, dados]) => [id, { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa, rev: 0 }]));
  const db = {
    from(table: string) {
      const filtros: { col: string; op: string; val: unknown }[] = [];
      let cols = '';
      let patch: { dados: Conversa } | undefined;
      const exec = (single: boolean) => {
        if (table === 'atendimento_canal_config') return { error: null, data: { canal_ativo: 'ultramsg', agente_ativo: true } };
        if (table === 'atendimento_contatos_teste') return { error: null, data: [...store.keys()].map(id => ({ conversa_id: id, contato_externo: '5511900000001' })) };
        if (table === 'office_workspace') return { error: null, data: single ? { dados: workspace } : [{ owner_id: 'owner-1', dados: workspace }] };
        if (table === 'casos') {
          const id = filtros.find(f => f.col === 'id' && f.op === 'eq')?.val as string | undefined;
          if (patch && id) { const row = store.get(id); if (!row) return { error: null, data: [] }; row.dados = JSON.parse(JSON.stringify(patch.dados)) as Conversa; row.rev++; return { error: null, data: [{ id }] }; }
          if (single && id) { const row = store.get(id); return { error: null, data: row ? { owner_id: row.owner_id, dados: JSON.parse(JSON.stringify(row.dados)) as Conversa, updated_at: String(row.rev) } : null }; }
          if (cols.includes('consulta:')) return { error: null, data: [...store].filter(([, r]) => r.dados.consultaAgendada).map(([id2, r]) => ({ id: id2, consulta: r.dados.consultaAgendada })) };
          return { error: null, data: [...store].map(([id2, r]) => ({ id: id2, owner_id: r.owner_id, dados: JSON.parse(JSON.stringify(r.dados)) as Conversa })) };
        }
        return { error: null, data: null };
      };
      const q = {
        select: (c?: string) => { if (c) cols = c; return q; },
        eq: (col: string, val: unknown) => { filtros.push({ col, op: 'eq', val }); return q; },
        not: () => q,
        in: (col: string, val: unknown) => { filtros.push({ col, op: 'in', val }); return q; },
        update: (v: { dados: Conversa }) => { patch = v; return q; },
        single: async () => exec(true), maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec(false)).then(res, rej),
      };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => store.get('c-conf')?.dados as Conversa };
}

beforeEach(() => { mocks.enviar.mockReset(); mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-1' }); });

describe('confirmação de 40 min com a secretaria digital', () => {
  it('flag desligada: equipe no controle continua só gerando aviso (comportamento anterior)', async () => {
    const { db, ler } = criarDb({ 'c-conf': conversa(iso('14:30'), {}, { humano: true }) }, defaultState);
    const r = await enviarConfirmacoesConsulta(db, SP('13:45'));
    expect(r).toMatchObject({ enviados: 0, avisos: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ler().agenteAna?.secretaria).toBeUndefined();
  });

  it('flag ligada e modo Híbrido: a confirmação sai com reserva da automação e fica aguardando a resposta', async () => {
    const { db, ler } = criarDb({ 'c-conf': conversa(iso('14:30'), {}, { humano: true }) }, LIGADA);
    const r = await enviarConfirmacoesConsulta(db, SP('13:45'));
    expect(r.enviados).toBe(1);
    expect(mocks.enviar).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'confirmacao', automacaoId: `confirmacao_consulta:${iso('14:30')}` }));
    const c = ler();
    expect(c.agenteAna?.secretaria?.automacoes?.[0]).toMatchObject({ tipo: 'confirmacao_consulta', estado: 'aguardando_resposta', mensagem: { idExterno: 'wamid-1' } });
    expect(c.agenteAna?.secretaria?.envio).toBeUndefined();
    expect(c.agenteAna?.humano).toBe(true);
    expect(c.mensagens.at(-1)).toMatchObject({ automacaoKey: `confirmacao_consulta:${iso('14:30')}`, idExterno: 'wamid-1' });
  });

  it('flag ligada e modo Humano ou Bloqueado: nada sai; aviso com texto pronto', async () => {
    for (const modo of ['humano', 'bloqueado'] as const) {
      mocks.enviar.mockClear();
      const { db, ler } = criarDb({ 'c-conf': aplicarModo(conversa(iso('14:30')), modo, { tipo: 'equipe' }, SP('09:00')) }, LIGADA);
      const r = await enviarConfirmacoesConsulta(db, SP('13:45'));
      expect(r).toMatchObject({ enviados: 0, avisos: 1 });
      expect(mocks.enviar).not.toHaveBeenCalled();
      expect(ler().avisosEquipe?.[0]?.textoPronto).toContain('14h30');
    }
  });

  it('flag ligada e equipe escrevendo agora: a confirmação urgente vira aviso prioritário', async () => {
    const humana = { id: 'e1', de: 'escritorio' as const, texto: 'Oi! Já te ligo.', hora: '', dataHora: iso('13:40'), autor: 'Dra. Carolina' };
    const { db, ler } = criarDb({ 'c-conf': conversa(iso('14:30'), { mensagens: [humana] }, { humano: true }) }, LIGADA);
    const r = await enviarConfirmacoesConsulta(db, SP('13:45'));
    expect(r).toMatchObject({ enviados: 0, avisos: 1 });
    expect(ler().avisosEquipe?.[0]).toMatchObject({ prioridade: true });
  });

  it('flag ligada com falha registrada (cancelamento não confirmado): a equipe confere, nada sai', async () => {
    const { db } = criarDb({ 'c-conf': conversa(iso('14:30'), {}, { humano: true, erro: 'Falha ao cancelar; conferir agenda.' }) }, LIGADA);
    const r = await enviarConfirmacoesConsulta(db, SP('13:45'));
    expect(r.enviados).toBe(0);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});

describe('lembrete das 08:00 com a secretaria digital', () => {
  it('flag desligada: equipe no controle pula em silêncio (comportamento anterior)', async () => {
    const { db, ler } = criarDb({ 'c-conf': conversa(iso('14:30'), {}, { humano: true }) }, defaultState);
    expect((await enviarLembretesConsulta(db, SP('08:00'))).enviados).toBe(0);
    expect(ler().avisosEquipe ?? []).toHaveLength(0);
  });

  it('flag ligada e modo Híbrido: o lembrete sai e o SIM/NÃO fica associado à automação', async () => {
    const { db, ler } = criarDb({ 'c-conf': conversa(iso('14:30'), {}, { humano: true }) }, LIGADA);
    expect((await enviarLembretesConsulta(db, SP('08:00'))).enviados).toBe(1);
    expect(mocks.enviar).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'lembrete', automacaoId: `lembrete_consulta:${iso('14:30')}` }));
    expect(ler().agenteAna?.secretaria?.automacoes?.[0]).toMatchObject({ tipo: 'lembrete_consulta', estado: 'aguardando_resposta', expiraEm: iso('14:30') });
  });

  it('flag ligada e modo Bloqueado: não envia e avisa a equipe uma única vez', async () => {
    const { db, ler } = criarDb({ 'c-conf': aplicarModo(conversa(iso('14:30')), 'bloqueado', { tipo: 'equipe' }, SP('07:00')) }, LIGADA);
    await enviarLembretesConsulta(db, SP('08:00'));
    await enviarLembretesConsulta(db, SP('08:05'));
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ler().avisosEquipe?.filter(a => a.id.startsWith('lembrete-consulta:'))).toHaveLength(1);
  });
});
