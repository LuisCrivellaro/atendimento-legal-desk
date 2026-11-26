import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState, type OfficeState } from '@/lib/office';
import type { CompromissoPJ } from '@/lib/projuris/agenda';
import { planejarSincronizacao, telefonesNoTexto, type ConversaAgenda } from '@/lib/atendimento/sincronizacao-agenda';
import { avisarRegistrosPendentes, executarMonitorOperacional, ID_TRAVA_MONITOR, sincronizarConsultasProjuris, type PortasAgendaMonitor, type ResultadoMonitor } from '@/lib/atendimento/monitor-operacional.server';
import { monitorAtrasado, resumoSeguro, type EstadoMonitor } from '@/lib/atendimento/monitor-estado';
import { enviarConfirmacoesConsulta } from '@/lib/atendimento/confirmacao-consulta.server';
import { enviarLembretesConsulta } from '@/lib/atendimento/lembrete-consulta.server';
import { aguardaRegistro, registrarSituacao, situacaoConsulta } from '@/lib/atendimento/situacao-consulta';
import { programadasDaConta } from '@/lib/atendimento/monitor-programadas';
import { lerConfigSecretaria } from '@/lib/atendimento/secretaria/config';
import { aplicarModo } from '@/lib/atendimento/secretaria/modos';

const mocks = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

/**
 * Monitor operacional central e sincronização com a agenda oficial. Dados fictícios; nenhum envio real (canal
 * simulado) e nenhuma chamada ao ProJuris (portas em memória). 25/11/2026 é quarta-feira; São Paulo = UTC-3.
 */
const SP = (hhmm: string, dia = '2026-11-25') => new Date(`${dia}T${hhmm}:00-03:00`);
const iso = (hhmm: string, dia = '2026-11-25') => SP(hhmm, dia).toISOString();
const CONTATO = '5511900000001';
const base = conversas[0] as Conversa;

function conversa(extra: Partial<Conversa> = {}, agente: Partial<NonNullable<Conversa['agenteAna']>> = {}): Conversa {
  return { ...base, id: 'c-1', nome: 'Maria Teste', modoIA: 'Automática', consultaAgendada: undefined, mensagens: [], timeline: [], avisosEquipe: [], agenteAna: { dados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' }, telefone: CONTATO, ...agente }, ...extra };
}

function compromisso(codigo: number, inicio: string, extra: Partial<CompromissoPJ> = {}): CompromissoPJ {
  return { codigo, titulo: 'Consulta inicial - Maria (11) 90000-0001', inicioMs: Date.parse(inicio), fimMs: Date.parse(inicio) + 1800000, concluido: false, ...extra };
}

/** Banco em memória: CAS em `casos`, monitor em `ana_monitoramento`, auditoria e contatos liberados. */
function criarDb(casos: Record<string, Conversa>, opts: { workspace?: OfficeState; contatos?: { conversa_id: string; contato_externo: string }[] } = {}) {
  const store = new Map(Object.entries(casos).map(([id, dados]) => [id, { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa, rev: 0 }]));
  const monitor = new Map<string, unknown>();
  const verificados = new Map<string, string>();
  const audit: Record<string, unknown>[] = [];
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const contatos = opts.contatos ?? [...store.keys()].map(id => ({ conversa_id: id, contato_externo: CONTATO }));
  const db = {
    from(table: string) {
      const filtros: { col: string; op: string; val: unknown }[] = [];
      let cols = '';
      let patch: { dados?: Conversa; estado?: unknown; verificado_em?: string } | undefined;
      let upsert: { id: string; estado: unknown; verificado_em?: string } | undefined;
      let insert: { id: string; estado: unknown; verificado_em?: string } | undefined;
      const exec = (single: boolean) => {
        if (table === 'atendimento_canal_config') return { error: null, data: { canal_ativo: 'ultramsg', agente_ativo: true } };
        if (table === 'atendimento_contatos_teste') {
          const ids = filtros.find(f => f.op === 'in')?.val as string[] | undefined;
          return { error: null, data: contatos.filter(c => !ids || ids.includes(c.conversa_id)) };
        }
        if (table === 'office_workspace') return { error: null, data: single ? { dados: opts.workspace ?? defaultState } : [{ owner_id: 'owner-1', dados: opts.workspace ?? defaultState }] };
        if (table === 'ana_monitoramento') {
          const id = filtros.find(f => f.col === 'id')?.val as string;
          if (insert) {
            if (monitor.has(insert.id)) return { error: { code: '23505', message: 'duplicate key' }, data: null };
            monitor.set(insert.id, clone(insert.estado)); verificados.set(insert.id, insert.verificado_em ?? '');
            return { error: null, data: null };
          }
          if (upsert) { monitor.set(upsert.id, clone(upsert.estado)); verificados.set(upsert.id, upsert.verificado_em ?? ''); return { error: null, data: null }; }
          if (patch) {
            if (!monitor.has(id)) return { error: null, data: [] };
            const lt = filtros.find(f => f.op === 'lt');
            if (lt && !((verificados.get(id) ?? '') < String(lt.val))) return { error: null, data: [] };
            const tok = filtros.find(f => f.col === 'estado->>token');
            if (tok && (monitor.get(id) as { token?: string } | undefined)?.token !== tok.val) return { error: null, data: [] };
            if (patch.estado !== undefined) monitor.set(id, clone(patch.estado));
            if (patch.verificado_em) verificados.set(id, patch.verificado_em);
            return { error: null, data: [{ id }] };
          }
          return { error: null, data: monitor.has(id) ? { estado: monitor.get(id) } : null };
        }
        if (table === 'casos') {
          const id = filtros.find(f => f.col === 'id' && f.op === 'eq')?.val as string | undefined;
          const rev = filtros.find(f => f.col === 'updated_at')?.val as string | undefined;
          if (patch?.dados && id) {
            const row = store.get(id);
            if (!row || (rev !== undefined && rev !== String(row.rev))) return { error: null, data: [] };
            row.dados = clone(patch.dados); row.rev++;
            return { error: null, data: [{ id }] };
          }
          if (single && id) { const row = store.get(id); return { error: null, data: row ? { owner_id: row.owner_id, dados: JSON.parse(JSON.stringify(row.dados)) as Conversa, updated_at: String(row.rev) } : null }; }
          if (cols.includes('consulta:')) return { error: null, data: [...store].filter(([, r]) => r.dados.consultaAgendada).map(([id2, r]) => ({ id: id2, consulta: r.dados.consultaAgendada })) };
          const ids = filtros.find(f => f.op === 'in')?.val as string[] | undefined;
          return { error: null, data: [...store].filter(([id2]) => !ids || ids.includes(id2)).map(([id2, r]) => ({ id: id2, owner_id: r.owner_id, dados: JSON.parse(JSON.stringify(r.dados)) as Conversa })) };
        }
        return { error: null, data: null };
      };
      const q = {
        select: (c?: string) => { if (c) cols = c; return q; },
        eq: (col: string, val: unknown) => { filtros.push({ col, op: 'eq', val }); return q; },
        not: (col: string, _op: string, val: unknown) => { filtros.push({ col, op: 'not', val }); return q; },
        in: (col: string, val: unknown) => { filtros.push({ col, op: 'in', val }); return q; },
        lt: (col: string, val: unknown) => { filtros.push({ col, op: 'lt', val }); return q; },
        update: (v: { dados?: Conversa; estado?: unknown; verificado_em?: string }) => { patch = v; return q; },
        upsert: (v: { id: string; estado: unknown; verificado_em?: string }) => { upsert = v; return q; },
        insert: (v: { id: string; estado: unknown; verificado_em?: string }) => { insert = v; return q; },
        single: async () => exec(true), maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec(false)).then(res, rej),
      };
      return q;
    },
    rpc: async (_nome: string, args: Record<string, unknown>) => { audit.push(args); return { error: null }; },
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: (id = 'c-1') => store.get(id)?.dados as Conversa, audit, monitor, verificados, alterar: (id: string, fn: (c: Conversa) => Conversa) => { const r = store.get(id); if (r) r.dados = fn(r.dados); } };
}

/** Resultado de um ciclo que executou (não ignorado pela trava). */
function est(r: ResultadoMonitor): EstadoMonitor {
  if ('ignorado' in r) throw new Error(r.ignorado);
  return r;
}

beforeEach(() => { mocks.enviar.mockReset(); mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-1' }); });

describe('sincronização com a agenda oficial (planejamento puro)', () => {
  const item = (c: Conversa, contato: string | undefined = CONTATO, id = c.id): ConversaAgenda => ({ id, conversa: c, contato });
  const agora = SP('09:00');

  it('telefone no título ou na descrição identifica o cliente (com ou sem 55, com máscara)', () => {
    expect(telefonesNoTexto('Consulta - Maria (11) 90000-0001')).toEqual(['1100000001']);
    expect(telefonesNoTexto('Tel +55 11 9 0000-0001 / 11900000001')).toEqual(['1100000001']);
    expect(telefonesNoTexto('Processo 0001234-56.2026.8.26.0100')).toEqual([]);
  });

  it('consulta marcada direto no ProJuris com telefone de um único cliente: vincula pelo código oficial', () => {
    const acoes = planejarSincronizacao([compromisso(501, iso('14:30'))], [item(conversa())], agora);
    expect(acoes).toEqual([{ tipo: 'vincular', conversaId: 'c-1', compromisso: expect.objectContaining({ codigo: 501 }), evidencia: 'telefone' }]);
  });

  it('nome completo só vale com vínculo confirmado no ProJuris', () => {
    const semFone = compromisso(502, iso('14:30'), { titulo: 'Consulta Maria Teste da Silva' });
    expect(planejarSincronizacao([semFone], [item(conversa())], agora)).toEqual([]);
    const confirmado = conversa({}, { vinculoProjuris: { codigoPessoa: 7, nome: 'Maria Teste da Silva', status: 'confirmado', origem: 'cpf', desde: iso('08:00') } });
    expect(planejarSincronizacao([semFone], [item(confirmado, undefined)], agora)[0]).toMatchObject({ tipo: 'vincular', evidencia: 'nome do cadastro' });
  });

  it('mais de um cliente possível ou cliente com outra consulta: pendência para a equipe, nunca vínculo', () => {
    const dois = planejarSincronizacao([compromisso(503, iso('14:30'))], [item(conversa()), item(conversa({ id: 'c-2' }), CONTATO, 'c-2')], agora);
    expect(dois).toEqual([expect.objectContaining({ tipo: 'pendencia', motivo: expect.stringMatching(/mais de um cliente/) })]);
    const outra = conversa({ consultaAgendada: iso('16:00') }, { reservaCalendar: { id: 'pj:900', inicio: iso('16:00'), fim: iso('16:30') } });
    const r = planejarSincronizacao([compromisso(504, iso('14:30')), compromisso(900, iso('16:00'))], [item(outra)], agora);
    expect(r).toEqual([expect.objectContaining({ tipo: 'pendencia', conversaId: 'c-1', motivo: expect.stringMatching(/outra consulta/) })]);
  });

  it('compromisso criado pelo Manager ADV, passado ou concluído não é revinculado', () => {
    const lista = [compromisso(505, iso('14:30'), { codigoExterno: 'manageradv:x' }), compromisso(506, iso('08:00')), compromisso(507, iso('15:00'), { concluido: true })];
    expect(planejarSincronizacao(lista, [item(conversa())], agora)).toEqual([]);
  });

  it('horário alterado no ProJuris atualiza a consulta; compromisso sumido é conferido pelo código', () => {
    const vinculada = conversa({ consultaAgendada: iso('14:30') }, { reservaCalendar: { id: 'pj:600', inicio: iso('14:30'), fim: iso('15:00'), origem: 'projuris_sincronizado' } });
    expect(planejarSincronizacao([compromisso(600, iso('15:00'))], [item(vinculada)], agora)).toEqual([{ tipo: 'atualizar_horario', conversaId: 'c-1', compromisso: expect.objectContaining({ codigo: 600 }) }]);
    expect(planejarSincronizacao([], [item(vinculada)], agora)).toEqual([{ tipo: 'verificar_cancelamento', conversaId: 'c-1', codigo: 600 }]);
  });
});

describe('consulta criada no ProJuris: sincronização, confirmação e cancelamento verificado', () => {
  it('vincula, a confirmação de 2 h sai com o texto oficial e não repete; eventos duplicados não duplicam nada', async () => {
    const { db, ler } = criarDb({ 'c-1': conversa() });
    const portas: PortasAgendaMonitor = { listar: async () => [compromisso(701, iso('14:30'))], situacao: async () => 'ativo' };
    expect(await sincronizarConsultasProjuris(db, SP('09:00'), portas)).toMatchObject({ ok: true, vinculadas: 1 });
    expect(await sincronizarConsultasProjuris(db, SP('09:05'), portas)).toMatchObject({ ok: true, vinculadas: 0 });
    const c = ler();
    expect(c.consultaAgendada).toBe(iso('14:30'));
    expect(c.agenteAna?.reservaCalendar).toMatchObject({ id: 'pj:701', origem: 'projuris_sincronizado' });
    expect(c.timeline.filter(t => /reconhecida por telefone/.test(t.evento))).toHaveLength(1);
    expect((await enviarConfirmacoesConsulta(db, SP('12:30'))).enviados).toBe(1);
    expect((await enviarConfirmacoesConsulta(db, SP('12:35'))).enviados).toBe(0);
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toContain('às 14h30');
  });

  it('horário alterado no ProJuris: a confirmação segue o novo horário', async () => {
    const { db, ler } = criarDb({ 'c-1': conversa() });
    await sincronizarConsultasProjuris(db, SP('09:00'), { listar: async () => [compromisso(702, iso('14:30'))] });
    await sincronizarConsultasProjuris(db, SP('10:00'), { listar: async () => [compromisso(702, iso('16:00'))] });
    expect(ler().consultaAgendada).toBe(iso('16:00'));
    expect((await enviarConfirmacoesConsulta(db, SP('12:30'))).enviados).toBe(0);
    expect((await enviarConfirmacoesConsulta(db, SP('14:00'))).enviados).toBe(1);
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toContain('às 16h');
  });

  it('compromisso concluído/excluído no ProJuris antes do horário: não vira "cancelada"; automações suspensas e equipe avisada', async () => {
    const { db, ler } = criarDb({ 'c-1': conversa() });
    await sincronizarConsultasProjuris(db, SP('09:00'), { listar: async () => [compromisso(703, iso('14:30'))] });
    expect(await sincronizarConsultasProjuris(db, SP('10:00'), { listar: async () => [], situacao: async () => 'concluido' })).toMatchObject({ suspensas: 1 });
    expect(await sincronizarConsultasProjuris(db, SP('10:05'), { listar: async () => [], situacao: async () => 'concluido' })).toMatchObject({ suspensas: 0 });
    const c = ler();
    expect(c.consultaAgendada).toBe(iso('14:30'));
    expect(situacaoConsulta(c).estado).toBe('agendada');
    expect(c.avisosEquipe?.filter(a => a.id === `agenda-suspensa:${iso('14:30')}` && a.prioridade)).toHaveLength(1);
    expect((await enviarConfirmacoesConsulta(db, SP('12:30'))).enviados).toBe(0);
    expect(mocks.enviar).not.toHaveBeenCalled();
    // Equipe reabre o compromisso no ProJuris: as automações voltam sozinhas.
    expect(await sincronizarConsultasProjuris(db, SP('12:00'), { listar: async () => [compromisso(703, iso('14:30'))] })).toMatchObject({ retomadas: 1 });
    expect(ler().agenteAna?.consultaSuspensa).toBeUndefined();
    expect(ler().avisosEquipe?.find(a => a.id === `agenda-suspensa:${iso('14:30')}`)?.resolvidoEm).toBeTruthy();
    expect((await enviarConfirmacoesConsulta(db, SP('12:30'))).enviados).toBe(1);
  });

  it('compromisso concluído depois do início (consulta aconteceu): nada muda, a equipe registra realizada/ausência', async () => {
    const { db, ler } = criarDb({ 'c-1': conversa() });
    await sincronizarConsultasProjuris(db, SP('09:00'), { listar: async () => [compromisso(706, iso('14:30'))] });
    expect(await sincronizarConsultasProjuris(db, SP('15:10'), { listar: async () => [], situacao: async () => 'concluido' })).toMatchObject({ suspensas: 0 });
    expect(ler().agenteAna?.consultaSuspensa).toBeUndefined();
    expect(situacaoConsulta(ler()).estado).toBe('agendada');
  });

  it('reconciliação: reserva da Anne no ProJuris sem gravação local vira pendência (nunca vínculo silencioso nem nova reserva)', async () => {
    const { db, ler } = criarDb({ 'c-1': conversa() });
    const orfa = compromisso(707, iso('15:00'), { codigoExterno: `manageradv:consulta:c-1:${Date.parse(iso('15:00'))}`, titulo: 'Consulta - Maria Teste' });
    const r1 = await sincronizarConsultasProjuris(db, SP('09:00'), { listar: async () => [orfa] });
    expect(r1.pendencias).toEqual([expect.objectContaining({ motivo: expect.stringMatching(/reserva da Anne/) })]);
    expect(ler().consultaAgendada).toBeUndefined();
    expect(ler().agenteAna?.reservaCalendar).toBeUndefined();
    expect(ler().avisosEquipe?.find(a => a.id === 'agenda-pendencia:707')).toMatchObject({ prioridade: true });
    expect((await enviarConfirmacoesConsulta(db, SP('13:00'))).enviados).toBe(0);
  });

  it('reserva da Anne já vinculada à conversa ou em lançamento provisório: sem pendência', async () => {
    const externo = `manageradv:consulta:c-1:${Date.parse(iso('15:00'))}`;
    const vinculada = conversa({ consultaAgendada: iso('15:00') }, { reservaCalendar: { id: 'pj:708', inicio: iso('15:00'), fim: iso('15:30') } });
    const a = criarDb({ 'c-1': vinculada });
    expect((await sincronizarConsultasProjuris(a.db, SP('09:00'), { listar: async () => [compromisso(708, iso('15:00'), { codigoExterno: externo })] })).pendencias).toEqual([]);
    const provisoria = conversa({ consultaAgendada: iso('15:00') }, { reservaCalendar: { id: 'google-1', inicio: iso('15:00'), fim: iso('15:30'), pendenteProjuris: { titulo: 't', descricao: 'd', codigoExterno: externo } } });
    const b = criarDb({ 'c-1': provisoria });
    expect((await sincronizarConsultasProjuris(b.db, SP('09:00'), { listar: async () => [compromisso(709, iso('15:00'), { codigoExterno: externo })] })).pendencias).toEqual([]);
  });

  it('falha do ProJuris (listagem ou conferência): nada é alterado nem cancelado', async () => {
    const { db, ler } = criarDb({ 'c-1': conversa() });
    await sincronizarConsultasProjuris(db, SP('09:00'), { listar: async () => [compromisso(704, iso('14:30'))] });
    expect(await sincronizarConsultasProjuris(db, SP('10:00'), { listar: async () => { throw new Error('503'); } })).toMatchObject({ ok: false });
    expect(await sincronizarConsultasProjuris(db, SP('10:05'), { listar: async () => [], situacao: async () => 'erro' })).toMatchObject({ ok: true, suspensas: 0 });
    expect(ler().consultaAgendada).toBe(iso('14:30'));
    expect(ler().agenteAna?.reservaCalendar?.id).toBe('pj:704');
  });

  it('cliente ambíguo: pendência para a equipe e nenhuma automação', async () => {
    const { db, ler } = criarDb({ 'c-1': conversa(), 'c-2': conversa({ id: 'c-2' }) });
    const r = await sincronizarConsultasProjuris(db, SP('09:00'), { listar: async () => [compromisso(705, iso('14:30'))] });
    expect(r.pendencias).toEqual([expect.objectContaining({ motivo: expect.stringMatching(/mais de um cliente/) })]);
    expect(ler().consultaAgendada).toBeUndefined();
    expect((await enviarConfirmacoesConsulta(db, SP('12:30'))).enviados).toBe(0);
  });
});

describe('situação da consulta (agendada, confirmada, realizada, ausência, cancelada)', () => {
  const marcada = conversa({ consultaAgendada: iso('14:30') }, { reservaCalendar: { id: 'pj:1', inicio: iso('14:30'), fim: iso('15:00') } });

  it('o horário passar não muda a situação: só o registro da equipe', () => {
    expect(situacaoConsulta(marcada).estado).toBe('agendada');
    expect(registrarSituacao(marcada, 'realizada', 'Dra.', SP('14:00'))).toEqual({ ok: false, erro: 'ainda_nao_comecou' });
    expect(aguardaRegistro(marcada, SP('15:30'))).toBe(false);
    expect(aguardaRegistro(marcada, SP('16:05'))).toBe(true);
    const r = registrarSituacao(marcada, 'realizada', 'Dra.', SP('15:10'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(situacaoConsulta(r.conversa).estado).toBe('realizada');
    expect(registrarSituacao(r.conversa, 'ausente', 'Dra.', SP('15:20'))).toEqual({ ok: false, erro: 'ja_registrada' });
    expect(aguardaRegistro(r.conversa, SP('18:00'))).toBe(false);
  });

  it('presença confirmada pela resposta ao lembrete ou à confirmação', () => {
    expect(situacaoConsulta({ ...marcada, agenteAna: { ...marcada.agenteAna, lembreteConsulta: { inicio: iso('14:30'), enviadoEm: iso('08:00'), confirmadoEm: iso('08:05') } } }).estado).toBe('confirmada');
    expect(situacaoConsulta({ ...marcada, agenteAna: { ...marcada.agenteAna, confirmacao40: { inicio: iso('14:30'), enviadoEm: iso('12:30'), resposta: 'sim', respondidoEm: iso('12:31') } } }).estado).toBe('confirmada');
  });

  it('consulta passada sem registro gera um único aviso para a equipe', async () => {
    const { db, ler } = criarDb({ 'c-1': marcada });
    expect(await avisarRegistrosPendentes(db, SP('16:10'))).toEqual({ avisos: 1 });
    expect(await avisarRegistrosPendentes(db, SP('16:15'))).toEqual({ avisos: 0 });
    expect(ler().avisosEquipe?.filter(a => a.id === `registro-consulta:${iso('14:30')}`)).toHaveLength(1);
  });
});

describe('monitor operacional central', () => {
  it('site fechado: a rotina do servidor sincroniza o ProJuris e envia a confirmação sem navegador; grava o estado', async () => {
    const { db, monitor, ler } = criarDb({ 'c-1': conversa() });
    const portas: PortasAgendaMonitor = { listar: async () => [compromisso(801, iso('14:30'))] };
    const etapas = (agora: Date) => [
      { nome: 'agenda-projuris', executar: async () => sincronizarConsultasProjuris(db, agora, portas) },
      { nome: 'confirmacoes', executar: () => enviarConfirmacoesConsulta(db, agora) },
      { nome: 'lembretes', executar: () => enviarLembretesConsulta(db, agora) },
    ];
    await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:00'), { etapas: etapas(SP('09:00')) });
    expect(ler().consultaAgendada).toBe(iso('14:30'));
    // Lembrete do dia sai no primeiro ciclo da manhã depois do vínculo (ciclos repetidos não duplicam).
    await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:05'), { etapas: etapas(SP('09:05')) });
    await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:10'), { etapas: etapas(SP('09:10')) });
    expect(mocks.enviar.mock.calls.filter(c => c[0].motivo === 'lembrete')).toHaveLength(1);
    const estado = monitor.get('monitor-operacional') as EstadoMonitor;
    expect(estado).toMatchObject({ ok: true, ultimaExecucao: SP('09:10').toISOString(), proximaPrevista: SP('09:15').toISOString() });
    expect(estado.etapas['agenda-projuris']).toMatchObject({ ok: true });
    expect(estado.historico).toHaveLength(3);
    // Presença: lembrete enviado às 9h05 → a confirmação das 12h30 respeita a política (sem redundância de 90 min, sai).
    const tarde = est(await executarMonitorOperacional(db, new Request('http://localhost'), SP('12:30'), { etapas: etapas(SP('12:30')) }));
    expect(tarde.etapas['confirmacoes']?.resumo).toMatchObject({ enviados: 1 });
  });

  it('dois disparos simultâneos: a trava deixa só um executar; trava presa de ciclo interrompido é retomada depois de 2 min', async () => {
    const { db, monitor, verificados } = criarDb({});
    let liberar!: () => void;
    const espera = new Promise<void>(r => { liberar = r; });
    let execucoes = 0;
    const lenta = executarMonitorOperacional(db, new Request('http://localhost'), SP('09:00'), { etapas: [{ nome: 'a', executar: async () => { execucoes++; await espera; return {}; } }] });
    const segunda = await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:00'), { etapas: [{ nome: 'a', executar: async () => { execucoes++; return {}; } }] });
    expect(segunda).toEqual({ ignorado: expect.stringMatching(/outra execução/) });
    liberar();
    expect('ignorado' in (await lenta)).toBe(false);
    expect(execucoes).toBe(1);
    expect('ignorado' in (await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:05'), { etapas: [] }))).toBe(false);
    // Ciclo interrompido no meio deixou a trava presa às 9h06.
    monitor.set(ID_TRAVA_MONITOR, { token: 'ciclo-interrompido' }); verificados.set(ID_TRAVA_MONITOR, SP('09:06').toISOString());
    expect(await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:07'), { etapas: [] })).toEqual({ ignorado: expect.any(String) });
    expect('ignorado' in (await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:10'), { etapas: [] }))).toBe(false);
  });

  it('etapa lenta (integração travada) vira falha por tempo limite e as demais continuam', async () => {
    const { db } = criarDb({});
    const r = est(await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:00'), { etapas: [
      { nome: 'travada', limiteMs: 30, executar: () => new Promise<Record<string, unknown>>(() => undefined) },
      { nome: 'seguinte', executar: async () => ({ enviados: 0 }) },
    ] }));
    expect(r.etapas['travada']).toMatchObject({ ok: false, erro: expect.stringMatching(/tempo limite/) });
    expect(r.etapas['seguinte']).toMatchObject({ ok: true });
  });

  it('gravação do estado falhou: o ciclo não finge sucesso', async () => {
    const { db } = criarDb({});
    const solto = db as unknown as { from: (t: string) => unknown };
    const original = solto.from.bind(solto);
    solto.from = (t: string) => {
      const q = original(t) as Record<string, unknown>;
      if (t === 'ana_monitoramento') q['upsert'] = () => ({ then: (res: (v: unknown) => unknown) => Promise.resolve({ error: { message: 'falha' }, data: null }).then(res) });
      return q;
    };
    await expect(executarMonitorOperacional(db, new Request('http://localhost'), SP('09:00'), { etapas: [] })).rejects.toThrow(/não foi gravado/);
  });

  it('falha numa etapa (ex.: UltraMsg fora) não impede as outras; auditoria só na transição', async () => {
    const { db, audit, monitor } = criarDb({});
    const etapas = [
      { nome: 'confirmacoes', executar: async () => { throw new Error('UltraMsg indisponível'); } },
      { nome: 'lembretes', executar: async () => ({ enviados: 0 }) },
    ];
    const r1 = est(await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:00'), { etapas }));
    expect(r1.ok).toBe(false);
    expect(r1.etapas['confirmacoes']).toMatchObject({ ok: false, erro: 'UltraMsg indisponível' });
    expect(r1.etapas['lembretes']).toMatchObject({ ok: true });
    await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:05'), { etapas });
    expect(audit.filter(a => a['p_acao'] === 'monitorOperacional' && a['p_status'] === 'erro')).toHaveLength(1);
    await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:10'), { etapas: [{ nome: 'confirmacoes', executar: async () => ({ enviados: 0 }) }] });
    expect(audit.filter(a => a['p_acao'] === 'monitorOperacional' && a['p_status'] === 'sucesso')).toHaveLength(1);
    expect((monitor.get('monitor-operacional') as EstadoMonitor).ok).toBe(true);
  });

  it('tempo do ciclo esgotado: etapa adiada não é marcada como executada e roda primeiro no ciclo seguinte', async () => {
    const { db } = criarDb({});
    let t = 0;
    const ordem: string[] = [];
    const etapas = [{ nome: 'a', executar: async () => { ordem.push('a'); return {}; } }, { nome: 'b', executar: async () => { ordem.push('b'); return {}; } }];
    const r = est(await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:00'), { relogio: () => (t += 30000), etapas }));
    expect(r.etapas['a']?.ok).toBe(true);
    expect(r.etapas['b']).toMatchObject({ adiada: true, executadoEm: '', pulada: expect.stringMatching(/tempo do ciclo/) });
    expect(r.adiadas).toEqual(['b']);
    expect(r.ok).toBe(true);
    ordem.length = 0;
    const r2 = est(await executarMonitorOperacional(db, new Request('http://localhost'), SP('09:05'), { etapas }));
    expect(ordem).toEqual(['b', 'a']);
    expect(r2.etapas['b']).toMatchObject({ ok: true, executadoEm: SP('09:05').toISOString() });
    expect(r2.etapas['b']?.adiada).toBeUndefined();
  });

  it('rotina parada: alerta quando a última execução tem mais de 15 minutos (ou nunca rodou)', () => {
    expect(monitorAtrasado(null, SP('09:00'))).toBe(true);
    expect(monitorAtrasado({ ultimaExecucao: iso('08:50') }, SP('09:00'))).toBe(false);
    expect(monitorAtrasado({ ultimaExecucao: iso('08:40') }, SP('09:00'))).toBe(true);
  });

  it('resumo gravado no painel tem só contagens e textos curtos (nada de dado de cliente)', () => {
    expect(resumoSeguro({ enviados: 2, motivo: 'x'.repeat(300), lista: [{ nome: 'Maria' }], motivos: { 'modo de teste': 3, conversa: { nome: 'Maria' } } })).toEqual({ enviados: 2, motivo: 'x'.repeat(120), motivos: { 'modo de teste': 3 } });
  });
});

describe('mensagens programadas do painel', () => {
  it('mostra lembrete e confirmação previstos, enviados ou bloqueados, com o motivo', () => {
    const config = lerConfigSecretaria(undefined);
    const marcada = conversa({ consultaAgendada: iso('14:30') }, { reservaCalendar: { id: 'pj:1', inicio: iso('14:30'), fim: iso('15:00') } });
    const r = programadasDaConta([{ id: 'c-1', nome: 'Maria Teste', dados: marcada }], config, SP('07:00'));
    expect(r.programadas).toEqual([
      expect.objectContaining({ tipo: 'lembrete', estado: 'prevista', quando: SP('08:00').toISOString() }),
      expect.objectContaining({ tipo: 'confirmacao', estado: 'prevista', quando: SP('12:30').toISOString() }),
    ]);
    const confirmada = { ...marcada, agenteAna: { ...marcada.agenteAna, lembreteConsulta: { inicio: iso('14:30'), enviadoEm: iso('08:00'), confirmadoEm: iso('08:10') } } };
    const depois = programadasDaConta([{ id: 'c-1', nome: 'Maria Teste', dados: confirmada }], config, SP('09:00'));
    expect(depois.programadas).toEqual([
      expect.objectContaining({ tipo: 'lembrete', estado: 'enviada' }),
      expect.objectContaining({ tipo: 'confirmacao', estado: 'nao_sai', motivo: 'cliente já confirmou presença pelo lembrete' }),
    ]);
    const tarde = programadasDaConta([{ id: 'c-1', nome: 'Maria Teste', dados: marcada }], config, SP('13:00'));
    expect(tarde.programadas.find(p => p.tipo === 'lembrete')).toMatchObject({ estado: 'nao_sai', motivo: expect.stringMatching(/janela do lembrete/) });
  });
});

describe('independência das camadas', () => {
  it('Anne conversacional desligada pela equipe (Híbrido): lembrete e confirmação continuam; Bloqueado: nada sai', async () => {
    const hibrida = aplicarModo(conversa({ consultaAgendada: iso('14:30') }, { reservaCalendar: { id: 'pj:1', inicio: iso('14:30'), fim: iso('15:00') } }), 'hibrido', { tipo: 'equipe' }, SP('07:00'));
    const a = criarDb({ 'c-1': hibrida });
    expect((await enviarLembretesConsulta(a.db, SP('08:00'))).enviados).toBe(1);
    const bloqueada = aplicarModo(conversa({ consultaAgendada: iso('14:30') }, { reservaCalendar: { id: 'pj:1', inicio: iso('14:30'), fim: iso('15:00') } }), 'bloqueado', { tipo: 'equipe' }, SP('07:00'));
    mocks.enviar.mockClear();
    const b = criarDb({ 'c-1': bloqueada });
    expect((await enviarLembretesConsulta(b.db, SP('08:00'))).enviados).toBe(0);
    expect((await enviarConfirmacoesConsulta(b.db, SP('12:30'))).enviados).toBe(0);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('automação desligada individualmente (lembrete/confirmação) não envia mesmo com a conversa no Automático', async () => {
    const marcada = conversa({ consultaAgendada: iso('14:30') }, { reservaCalendar: { id: 'pj:1', inicio: iso('14:30'), fim: iso('15:00') } });
    const desligada = { ...defaultState, secretaria: { ativa: true, permissoes: { confirmacao_consulta: 'desligado', lembrete_consulta: 'desligado' } } } as OfficeState;
    const { db } = criarDb({ 'c-1': marcada }, { workspace: desligada });
    expect((await enviarLembretesConsulta(db, SP('08:00'))).enviados).toBe(0);
    expect((await enviarConfirmacoesConsulta(db, SP('12:30'))).enviados).toBe(0);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('lembrete nunca sai depois do início da consulta (rotina retomada tarde)', async () => {
    const marcada = conversa({ consultaAgendada: iso('09:00') }, { reservaCalendar: { id: 'pj:1', inicio: iso('09:00'), fim: iso('09:30') } });
    const { db } = criarDb({ 'c-1': marcada });
    expect((await enviarLembretesConsulta(db, SP('09:10'))).enviados).toBe(0);
    expect((await enviarLembretesConsulta(db, SP('08:45'))).enviados).toBe(0);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});
