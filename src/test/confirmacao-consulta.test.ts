import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState, type OfficeState } from '@/lib/office';
import {
  MODELO_CONFIRMACAO_CONSULTA, confirmacao40Respondivel, decidirConfirmacao40, faseConfirmacao, mensagemConfirmacaoConsulta,
  registrarRespostaConfirmacao40, respostaConfirmacao40, saudacaoPorHorario, textoConfirmacao40,
} from '@/lib/atendimento/confirmacao-consulta';
import { enviarConfirmacoesConsulta } from '@/lib/atendimento/confirmacao-consulta.server';
import { enviarLembretesConsulta } from '@/lib/atendimento/lembrete-consulta.server';
import { mensagemLembreteAna } from '@/lib/atendimento/lembrete-consulta';
import { mergeReplies } from '@/lib/respostas-prontas';
import { fillCalendarReply } from '@/lib/atendimento/quick-reply-calendar';
import { programmed, defaultAutomations } from '@/lib/atendimento';
import { buildAssessor } from '@/lib/assessor';

const mocks = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

// Dados fictícios. 25/11/2026 é quarta-feira; São Paulo = UTC-3.
const SP = (hhmm: string, dia = '2026-11-25') => new Date(`${dia}T${hhmm}:00-03:00`);
const iso = (hhmm: string, dia = '2026-11-25') => SP(hhmm, dia).toISOString();
const fixture = conversas[0];
if (!fixture) throw new Error('fixture');
const base: Conversa = fixture;

function conversa(inicio: string | undefined, extra: Partial<Conversa> = {}): Conversa {
  return {
    ...base, id: 'c-conf', modoIA: 'Automática', consultaAgendada: inicio, mensagens: [], timeline: [],
    agenteAna: inicio ? { reservaCalendar: { id: 'evt-1', inicio, fim: new Date(Date.parse(inicio) + 30 * 60000).toISOString() }, dados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' } } : {},
    ...extra,
  };
}

/** Banco falso com CAS simples e os filtros usados pelas rotinas. */
function criarDb(opts: { casos: Record<string, Conversa>; contatos?: { conversa_id: string; contato_externo: string }[]; workspace?: OfficeState; canal?: string }) {
  const store = new Map(Object.entries(opts.casos).map(([id, dados]) => [id, { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa, rev: 0 }]));
  const audit: Record<string, unknown>[] = [];
  const contatos = opts.contatos ?? [...store.keys()].map(id => ({ conversa_id: id, contato_externo: '5511900000001' }));
  const db = {
    from(table: string) {
      const filtros: { col: string; op: string; val: unknown }[] = [];
      let cols = '';
      let patch: { dados: Conversa } | undefined;
      const exec = (single: boolean) => {
        if (table === 'atendimento_canal_config') return { error: null, data: { canal_ativo: opts.canal ?? 'ultramsg', agente_ativo: true } };
        if (table === 'atendimento_contatos_teste') {
          const ids = filtros.find(f => f.op === 'in')?.val as string[] | undefined;
          return { error: null, data: contatos.filter(c => !ids || ids.includes(c.conversa_id)) };
        }
        if (table === 'office_workspace') return { error: null, data: single ? { dados: opts.workspace ?? defaultState } : [{ owner_id: 'owner-1', dados: opts.workspace ?? defaultState }] };
        if (table === 'casos') {
          const id = filtros.find(f => f.col === 'id' && f.op === 'eq')?.val as string | undefined;
          if (patch && id) {
            const row = store.get(id);
            if (!row) return { error: null, data: [] };
            row.dados = JSON.parse(JSON.stringify(patch.dados)) as Conversa; row.rev++;
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
        update: (v: { dados: Conversa }) => { patch = v; return q; },
        single: async () => exec(true), maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec(false)).then(res, rej),
      };
      return q;
    },
    rpc: async (_nome: string, args: Record<string, unknown>) => { audit.push(args); return { error: null }; },
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: (id = 'c-conf') => store.get(id)?.dados as Conversa, audit, alterar: (id: string, fn: (c: Conversa) => Conversa) => { const r = store.get(id); if (r) r.dados = fn(r.dados); } };
}

beforeEach(() => { mocks.enviar.mockReset(); mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-1' }); });
afterEach(() => { vi.useRealTimers(); });

describe('texto oficial da confirmação de 40 min (D1)', () => {
  it('saudação pelo horário de São Paulo e hora no formato 14h30', () => {
    expect(saudacaoPorHorario(SP('11:59'))).toBe('Bom dia');
    expect(saudacaoPorHorario(SP('12:00'))).toBe('Boa tarde');
    expect(saudacaoPorHorario(SP('17:59'))).toBe('Boa tarde');
    expect(saudacaoPorHorario(SP('18:00'))).toBe('Boa noite');
    expect(mensagemConfirmacaoConsulta(iso('14:30'), SP('13:45'))).toBe('Olá\nBoa tarde ! 😊\n📍Passando para confirmar o seu atendimento hoje às 14h30, ok?!\nEquipe CS Advocacia ⚖️\nLawyers');
    expect(mensagemConfirmacaoConsulta(iso('09:00'), SP('08:15'))).toContain('Bom dia ! 😊');
    expect(mensagemConfirmacaoConsulta(iso('09:00'), SP('08:15'))).toContain('hoje às 9h, ok?!');
    expect(mensagemConfirmacaoConsulta(iso('14:30'), SP('13:45'))).not.toMatch(/\d{4}-\d{2}|:\d{2}:\d{2}/);
  });
  it('mensagem pronta /confirmar usa o mesmo modelo e só preenche com reserva real', () => {
    const r = mergeReplies().find(x => x.atalho === 'confirmar');
    expect(r?.texto).toBe(MODELO_CONFIRMACAO_CONSULTA);
    const reserva = { id: 'evt', inicio: iso('14:30'), fim: iso('15:00') };
    expect(fillCalendarReply(MODELO_CONFIRMACAO_CONSULTA, { reserva }, SP('13:45'))).toBe(mensagemConfirmacaoConsulta(iso('14:30'), SP('13:45')));
    expect(fillCalendarReply(MODELO_CONFIRMACAO_CONSULTA, {}, SP('13:45'))).toContain('{horadaconsulta}');
  });
  it('janela padrão: até 2 h antes e mais de 30 min; nunca com 30 min ou menos', () => {
    expect(faseConfirmacao(iso('14:30'), SP('12:29'))).toBe('cedo');
    expect(faseConfirmacao(iso('14:30'), SP('12:30'))).toBe('janela');
    expect(faseConfirmacao(iso('14:30'), SP('13:45'))).toBe('janela');
    expect(faseConfirmacao(iso('14:30'), SP('13:59'))).toBe('janela');
    expect(faseConfirmacao(iso('14:30'), SP('14:00'))).toBe('perdida');
    expect(faseConfirmacao(iso('14:30'), SP('14:30'))).toBe('passada');
  });
  it('antecedência configurável (1 h e 40 min)', () => {
    expect(faseConfirmacao(iso('14:30'), SP('13:20'), 60)).toBe('cedo');
    expect(faseConfirmacao(iso('14:30'), SP('13:30'), 60)).toBe('janela');
    expect(faseConfirmacao(iso('14:30'), SP('13:45'), 40)).toBe('cedo');
    expect(faseConfirmacao(iso('14:30'), SP('13:50'), 40)).toBe('janela');
  });
  it('automação exibida como confirmação de presença 2 h antes', () => {
    expect(programmed(conversa(iso('14:30')), defaultAutomations).find(j => j.key === 'consulta')).toMatchObject({ title: 'Confirmação de presença (padrão 2 h antes)', when: iso('12:30') });
  });
});

describe('respostas à confirmação', () => {
  it.each(['ok', 'OK!', 'Sim', 'confirmo', 'Confirmado', '👍', '👍🏻', 'estarei aí', 'Ok, obrigada', 'sim, estarei aí 😊', 'Combinado ✅'])('"%s" confirma presença', t => expect(respostaConfirmacao40(t)).toBe('sim'));
  it.each(['não', 'Não vou conseguir', 'vou atrasar uns 10 min', 'preciso remarcar', 'não posso hoje', 'tive um imprevisto'])('"%s" nunca cancela: vai para remarcação', t => expect(respostaConfirmacao40(t)).toBe('nao'));
  it.each(['Qual o link?', 'bom dia', 'ok, mas qual é o link da reunião?', '😢', 'pode me ligar antes?'])('"%s" segue o fluxo normal', t => expect(respostaConfirmacao40(t)).toBeUndefined());
  it('só vale enquanto a confirmação for a última mensagem do escritório', () => {
    const inicio = iso('14:30');
    const c = conversa(inicio, { mensagens: [{ id: 'conf', de: 'escritorio', canal: 'ultramsg', texto: 'x', hora: '', idExterno: 'wamid-1' }] });
    c.agenteAna = { ...c.agenteAna, confirmacao40: { inicio, reservadoEm: iso('13:45'), enviadoEm: iso('13:45'), idExterno: 'wamid-1' } };
    expect(confirmacao40Respondivel(c, 'ultramsg', SP('13:47'))).toBe(true);
    const depois = { ...c, mensagens: [...c.mensagens, { id: 'outra', de: 'escritorio' as const, canal: 'ultramsg', texto: 'Quer mesmo cancelar?', hora: '', idExterno: 'wamid-2' }] };
    expect(confirmacao40Respondivel(depois, 'ultramsg', SP('13:47'))).toBe(false);
    const respondida = registrarRespostaConfirmacao40(c, 'sim', SP('13:47'));
    expect(confirmacao40Respondivel(respondida, 'ultramsg', SP('13:48'))).toBe(false);
  });
  it('"não" vira aviso prioritário e nada é cancelado', () => {
    const inicio = iso('14:30');
    const c = conversa(inicio);
    c.agenteAna = { ...c.agenteAna, confirmacao40: { inicio, enviadoEm: iso('13:45') } };
    const r = registrarRespostaConfirmacao40(c, 'nao', SP('13:47'));
    expect(r.consultaAgendada).toBe(inicio);
    expect(r.agenteAna?.reservaCalendar?.inicio).toBe(inicio);
    expect(r.avisosEquipe?.[0]).toMatchObject({ prioridade: true, tipo: 'confirmacao40' });
    expect(r.agenteAna?.confirmacao40).toMatchObject({ resposta: 'nao' });
  });
});

describe('rotina de confirmação 40 min (cenários P0-1)', () => {
  it('1. consulta às 14h30: 12h25 não envia; 13h45 envia o texto exato; 13h50 não repete', async () => {
    const { db, ler } = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) } });
    expect(await enviarConfirmacoesConsulta(db, SP('12:25'))).toMatchObject({ enviados: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(await enviarConfirmacoesConsulta(db, SP('13:45'))).toMatchObject({ enviados: 1 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    // Biblioteca oficial (26/11/2026): à tarde vale o modelo 08.2, exatamente como recebido.
    expect(mocks.enviar.mock.calls[0]?.[0]).toMatchObject({ conversaId: 'c-conf', motivo: 'confirmacao', contatoEsperado: '5511900000001', texto: 'Olá! 👋🏻\nTudo bem? 😊\n📍 Estamos passando para confirmar a sua consulta.\n📆 Agendada para hoje, quarta-feira, 25/11/2026, às 14h30. ✅\nCaso haja alguma alteração, pedimos a gentileza de avisar com antecedência. 🙏🏻\nEquipe CS Advocacia\ncarolinasantos.com.br' });
    expect(await enviarConfirmacoesConsulta(db, SP('13:50'))).toMatchObject({ enviados: 0 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    const c = ler();
    expect(c.mensagens.at(-1)).toMatchObject({ autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: 'wamid-1', status: 'enviada', modeloOficial: { id: 'T08.2', versao: 1 } });
    expect(c.timeline.at(-1)?.evento).toBe('Confirmação de presença enviada pela Anne');
    expect(c.agenteAna?.confirmacao40).toMatchObject({ inicio: iso('14:30'), enviadoEm: SP('13:45').toISOString(), idExterno: 'wamid-1', modelo: { id: 'T08.2' } });
    expect(c.agenteAna?.envioAna?.texto).toContain('📍 Estamos passando para confirmar a sua consulta.');
  });
  it('2 e 11. consulta às 9h: lembrete oficial 01 às 08:00; a confirmação das 8h15 seria redundante e não sai', async () => {
    const nove = conversa(iso('09:00'));
    nove.agenteAna = { ...nove.agenteAna, telefone: '5511900000001' };
    const { db, ler } = criarDb({ casos: { 'c-conf': nove } });
    expect(await enviarLembretesConsulta(db, SP('08:00'))).toMatchObject({ enviados: 1 });
    expect(mocks.enviar.mock.calls[0]?.[0]).toMatchObject({ motivo: 'lembrete', texto: 'Oi, Maria! Bom dia 😊\nPassando para lembrar que:\n📆 Sua consulta está confirmada para hoje, às 9h. ✅\nCaso precise fazer alguma alteração, pedimos a gentileza de nos avisar com pelo menos 1 hora de antecedência.\nEstamos te aguardando!\nEquipe CS Advocacia\ncarolinasantos.com.br' });
    // Política anti-redundância (01/02/08.2): lembrete enviado há menos de 90 min → sem confirmação e sem aviso.
    expect(await enviarConfirmacoesConsulta(db, SP('08:15'))).toMatchObject({ enviados: 0, avisos: 0 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    const c = ler();
    expect(c.agenteAna?.lembreteConsulta?.inicio).toBe(iso('09:00'));
    expect(c.mensagens.at(-1)?.modeloOficial).toEqual({ id: 'T01', versao: 1 });
    // O modelo 01 não pede SIM/NÃO: nenhum consentimento de cancelamento fica gravado.
    expect(c.agenteAna?.confirmacaoCancelamento).toBeUndefined();
  });
  it('2b. consulta às 11h: lembrete às 08:00 e confirmação oficial 02 ("Bom dia") às 10h15', async () => {
    const onze = conversa(iso('11:00'));
    const { db } = criarDb({ casos: { 'c-conf': onze } });
    await enviarLembretesConsulta(db, SP('08:00'));
    expect(await enviarConfirmacoesConsulta(db, SP('10:15'))).toMatchObject({ enviados: 1 });
    expect(mocks.enviar.mock.calls[1]?.[0].texto).toBe('Olá! Bom dia 😊\nPassando para confirmar o seu atendimento hoje às 11h ✅, ok?\nEquipe CS Advocacia ⚖️');
  });
  it('3. consulta marcada às 10h para as 14h: a confirmação é a única e sai', async () => {
    const { db, ler } = criarDb({ casos: { 'c-conf': conversa(iso('14:00')) } });
    expect(await enviarConfirmacoesConsulta(db, SP('13:15'))).toMatchObject({ enviados: 1 });
    expect(ler().agenteAna?.lembreteConsulta).toBeUndefined();
  });
  it('4. ciclo às 14h05 (25 min) sem envio anterior: não envia, gera aviso e auditoria', async () => {
    const { db, ler, audit } = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) } });
    expect(await enviarConfirmacoesConsulta(db, SP('14:05'))).toMatchObject({ enviados: 0, avisos: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ler().avisosEquipe?.[0]).toMatchObject({ tipo: 'confirmacao40', prioridade: true, texto: 'Confirmação de presença não enviada (consulta às 14h30): confirmar por telefone.' });
    expect(audit.some(a => a['p_acao'] === 'confirmacaoConsulta' && a['p_status'] === 'erro')).toBe(true);
    expect(await enviarConfirmacoesConsulta(db, SP('14:10'))).toMatchObject({ avisos: 0 });
    expect(ler().avisosEquipe).toHaveLength(1);
    const a = buildAssessor([{ id: 'c-conf', nome: 'Maria', mine: true, pipeline: 0, prazos: [], avisosEquipe: ler().avisosEquipe ?? [] }], '2026-11-25');
    expect(a.tasks.some(t => t.urgent && t.label.includes('Confirmação de presença não enviada'))).toBe(true);
  });
  it('5. três ciclos dentro da janela: uma só mensagem', async () => {
    const { db } = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) } });
    for (const h of ['13:41', '13:45', '13:49']) await enviarConfirmacoesConsulta(db, SP(h));
    expect(mocks.enviar).toHaveBeenCalledOnce();
  });
  it('6. secretaria desligada e conversa com controle humano: não envia e gera aviso com texto pronto', async () => {
    const c = conversa(iso('14:30'));
    c.agenteAna = { ...c.agenteAna, humano: true };
    const { db, ler } = criarDb({ casos: { 'c-conf': c }, workspace: { ...defaultState, secretaria: { ativa: false } } as OfficeState });
    expect(await enviarConfirmacoesConsulta(db, SP('13:45'))).toMatchObject({ enviados: 0, avisos: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ler().avisosEquipe?.[0]?.textoPronto).toBe(textoConfirmacao40(iso('14:30'), SP('13:45')).texto);
    expect(ler().avisosEquipe?.[0]?.textoPronto).toContain('às 14h30. ✅');
  });
  it('6b. modo Desligada, Anne pausada no escritório ou automação desligada: nada sai sozinho', async () => {
    const desligada = criarDb({ casos: { 'c-conf': conversa(iso('14:30'), { modoIA: 'Desligada' }) } });
    expect(await enviarConfirmacoesConsulta(desligada.db, SP('13:45'))).toMatchObject({ enviados: 0, avisos: 1 });
    const pausada = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) }, workspace: { ...defaultState, anaPausa: { ativa: true, motivo: 'teste' } } });
    expect(await enviarConfirmacoesConsulta(pausada.db, SP('13:45'))).toMatchObject({ enviados: 0, avisos: 1 });
    const semAutomacao = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) }, workspace: { ...defaultState, automations: { ...defaultAutomations, lembreteConsulta: false } } });
    expect(await enviarConfirmacoesConsulta(semAutomacao.db, SP('13:45'))).toMatchObject({ enviados: 0, avisos: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it('sem recibo ou sem contato liberado: não envia e lista para a equipe', async () => {
    const semRecibo = conversa(iso('14:30'));
    semRecibo.agenteAna = {};
    const a = criarDb({ casos: { 'c-conf': semRecibo } });
    await enviarConfirmacoesConsulta(a.db, SP('13:45'));
    expect(a.ler().avisosEquipe?.[0]?.texto).toContain('sem recibo');
    const b = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) }, contatos: [] });
    await enviarConfirmacoesConsulta(b.db, SP('13:45'));
    expect(b.ler().avisosEquipe?.[0]?.texto).toContain('sem contato de WhatsApp');
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it('9. remarcação depois do envio: nova confirmação no novo horário', async () => {
    const { db, alterar } = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) } });
    await enviarConfirmacoesConsulta(db, SP('13:45'));
    alterar('c-conf', c => ({ ...c, consultaAgendada: iso('16:00'), agenteAna: { ...c.agenteAna, reservaCalendar: { id: 'evt-2', inicio: iso('16:00'), fim: iso('16:30') } } }));
    await enviarConfirmacoesConsulta(db, SP('15:15'));
    expect(mocks.enviar).toHaveBeenCalledTimes(2);
    expect(mocks.enviar.mock.calls[1]?.[0].texto).toContain('Agendada para hoje, quarta-feira, 25/11/2026, às 16h. ✅');
  });
  it('10. consulta cancelada: nada', async () => {
    const { db } = criarDb({ casos: { 'c-conf': conversa(undefined) } });
    expect(await enviarConfirmacoesConsulta(db, SP('13:45'))).toMatchObject({ enviados: 0, avisos: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it('12. falha do provedor: nada reenviado, auditoria e aviso gravados', async () => {
    mocks.enviar.mockRejectedValue(new Error('timeout'));
    const { db, ler, audit } = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) } });
    expect(await enviarConfirmacoesConsulta(db, SP('13:45'))).toMatchObject({ enviados: 0, falhas: 1 });
    await enviarConfirmacoesConsulta(db, SP('13:50'));
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(audit.some(a => a['p_acao'] === 'confirmacaoConsulta' && a['p_status'] === 'erro')).toBe(true);
    expect(ler().agenteAna?.confirmacao40?.falhouEm).toBeTruthy();
    expect(ler().avisosEquipe?.[0]?.texto).toContain('Não reenviar sem conferir');
    expect(ler().mensagens).toHaveLength(0);
  });
  it('canal desligado ou não UltraMsg: nada sai', async () => {
    const { db } = criarDb({ casos: { 'c-conf': conversa(iso('14:30')) }, canal: 'desligado' });
    expect(await enviarConfirmacoesConsulta(db, SP('13:45'))).toMatchObject({ enviados: 0, motivo: 'canal ou Anne desligados' });
  });
  it('decisão pura: consulta de outro dia é ignorada', () => {
    expect(decidirConfirmacao40({ consultaAgendada: iso('14:30', '2026-11-26'), reservaInicio: iso('14:30', '2026-11-26'), modo: 'Automática', anaPausadaGlobal: false, automacaoLigada: true, contatoLiberado: true }, SP('13:45')).tipo).toBe('ignorar');
  });
});
