import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState, type OfficeState } from '@/lib/office';
import { podeExecutarAna } from '@/lib/atendimento/ana-execution';
import { estacionarMensagem, falhaPausaIA, mensagemParaRetomar, reenfileirar, type PausaIA } from '@/lib/atendimento/pausa-ia';
import { testarChaveClaude, verificarPausaIA } from '@/lib/atendimento/pausa-ia.server';
import { processarAna } from '@/lib/atendimento/ana.server';

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), enviar: vi.fn() }));
vi.mock('@/lib/atendimento/ana-relacionamento.server', () => ({ reconhecerRelacionamentoAna: async () => ({ identidade: { tipo: 'nao_encontrado' }, rel: { situacao: 'novo_lead', consultaInicial: true, quantidadeProcessos: 0 }, nome: '' }) }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));
vi.mock('@/lib/atendimento/consulta-processo.server', () => ({ fluxoProcessoReal: async () => false, enviarAvisoProcesso: vi.fn() }));
vi.mock('@/lib/atendimento/projuris-agenda.server', () => ({ cancelarAgenda: vi.fn(), remarcarAgenda: vi.fn(), reservarAgenda: vi.fn(), ocupadosAgenda: vi.fn() }));

/**
 * Pausa da IA da Anne: só as respostas escritas pelo modelo esperam; o monitor testa a chave e retoma sozinho.
 * Dados fictícios; nenhum envio real nem chamada ao Claude. 25/11/2026, 16:47 UTC = 13:47 em São Paulo.
 */
const AGORA = new Date('2026-11-25T16:47:00.000Z');
const antes = (min: number) => new Date(AGORA.getTime() - min * 60000).toISOString();
const telefone = '5511900000001';
const fixture = conversas[0];
if (!fixture) throw new Error('fixture');
const base: Conversa = fixture;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function conversa(ultima: Partial<Conversa['mensagens'][number]> = {}, agente: Partial<NonNullable<Conversa['agenteAna']>> = {}): Conversa {
  return {
    ...base, id: 'caso-1', modoIA: 'Automática', timeline: [], avisosEquipe: [],
    agenteAna: { apresentado: true, telefone, dados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' }, ...agente },
    mensagens: [
      { id: 'of-1', de: 'escritorio', canal: 'ultramsg', texto: 'Olá, Maria.', hora: '13:00', dataHora: antes(47), status: 'enviada' },
      { id: 'cli-1', de: 'cliente', canal: 'ultramsg', texto: 'Tenho uma dúvida sobre o processo', hora: '13:40', dataHora: antes(7), ...ultima },
    ],
  };
}

describe('regras puras da pausa da IA', () => {
  it('só falha de chave/conta pausa; falha temporária nunca', () => {
    expect(falhaPausaIA({ code: 'chave_invalida' })).toBe(true);
    for (const statusCode of [401, 402, 403, 404]) expect(falhaPausaIA({ statusCode })).toBe(true);
    expect(falhaPausaIA({ code: 'rate_limited', statusCode: 429 })).toBe(false);
    expect(falhaPausaIA({ code: 'server_unavailable' })).toBe(false);
  });
  it('mensagem estacionada não é retomada pela recuperação; a tentativa não conta', () => {
    const c = conversa({ iaProcessada: true, iaExecucao: { estado: 'executando', tentativas: 1, desde: antes(1) } });
    const m = estacionarMensagem(c, 'cli-1').mensagens.at(-1)!;
    expect(m.iaExecucao).toMatchObject({ estado: 'aguardando', tentativas: 0 });
    expect(m.iaExecucao?.retryEm).toBeUndefined();
    expect(podeExecutarAna(m, AGORA.getTime() + 86400000)).toBe(false);
  });
  it('retomada devolve à fila a mensagem estacionada e a recebida depois do início da pausa', () => {
    const pausa = { desde: antes(30) };
    const estacionada = estacionarMensagem(conversa({ iaExecucao: { estado: 'executando', tentativas: 1, desde: antes(7) } }), 'cli-1');
    expect(mensagemParaRetomar(estacionada, pausa, AGORA.getTime())).toBe('cli-1');
    expect(mensagemParaRetomar(conversa(), pausa, AGORA.getTime())).toBe('cli-1');
    const fila = reenfileirar(conversa(), 'cli-1', AGORA).mensagens.at(-1)!;
    expect(podeExecutarAna(fila, AGORA.getTime())).toBe(true);
  });
  it('retomada não responde o que não é dela', () => {
    const pausa = { desde: antes(30) };
    const t = AGORA.getTime();
    expect(mensagemParaRetomar(conversa({ dataHora: antes(60) }), pausa, t)).toBeUndefined();
    expect(mensagemParaRetomar(conversa({}, { humano: true }), pausa, t)).toBeUndefined();
    expect(mensagemParaRetomar(conversa({ tipo: 'audio', texto: '' }), pausa, t)).toBeUndefined();
    expect(mensagemParaRetomar(conversa({ iaProcessada: true }), pausa, t)).toBeUndefined();
    expect(mensagemParaRetomar(conversa({ iaProcessada: true, iaExecucao: { estado: 'concluida', tentativas: 1, desde: antes(7) } }), pausa, t)).toBeUndefined();
    const respondida = conversa();
    respondida.mensagens.push({ id: 'of-2', de: 'escritorio', canal: 'ultramsg', texto: 'Já respondo.', hora: '13:45', dataHora: antes(2), status: 'enviada' });
    expect(mensagemParaRetomar(respondida, pausa, t)).toBeUndefined();
    // Mais de 24 h: a equipe atende.
    const velha = estacionarMensagem(conversa({ dataHora: antes(25 * 60), iaExecucao: { estado: 'executando', tentativas: 1, desde: antes(25 * 60) } }), 'cli-1');
    expect(mensagemParaRetomar(velha, pausa, t)).toBeUndefined();
    // Pausa antiga sem início gravado: só as últimas 6 h.
    expect(mensagemParaRetomar(conversa({ dataHora: antes(5 * 60) }), {}, t)).toBe('cli-1');
    expect(mensagemParaRetomar(conversa({ dataHora: antes(7 * 60) }), {}, t)).toBeUndefined();
  });
});

describe('teste da chave do Claude', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('chamada mínima de 1 token com a chave aparada e o modelo da Anne', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ' credential-for-test\n');
    vi.stubEnv('ANA_MODELO', '');
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await testarChaveClaude(f as unknown as typeof fetch)).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('credential-for-test');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 1 });
  });
  it('chave recusada, provedor fora do ar ou chave ausente: não retoma', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'credential-for-test');
    expect(await testarChaveClaude(vi.fn().mockResolvedValue(new Response('{}', { status: 401 })) as unknown as typeof fetch)).toEqual({ ok: false, motivo: 'O Claude ainda recusa a chave de acesso.' });
    expect((await testarChaveClaude(vi.fn().mockRejectedValue(new Error('rede')) as unknown as typeof fetch)).ok).toBe(false);
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect((await testarChaveClaude(vi.fn() as unknown as typeof fetch)).ok).toBe(false);
  });
});

/** Banco em memória com CAS em `office_workspace` e `casos`, filtro pelo campo da pausa e auditoria. */
function criarBanco(c: Conversa, pausa?: PausaIA) {
  let ws = { dados: { ...clone(defaultState), ...(pausa ? { anaPausa: pausa } : {}) } as Record<string, unknown>, rev: 0 };
  const caso = { owner_id: 'owner-1', dados: clone(c), rev: 0 };
  const audit: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      const f: Record<string, unknown> = {};
      let cols = '';
      let patch: { dados: unknown } | undefined;
      const exec = (single: boolean) => {
        if (table === 'office_workspace') {
          if (patch) {
            if (f['updated_at'] !== String(ws.rev)) return { error: null, data: [] };
            ws = { dados: clone(patch.dados) as Record<string, unknown>, rev: ws.rev + 1 };
            return { error: null, data: [{ owner_id: 'owner-1' }] };
          }
          if (cols.startsWith('owner_id,pausa')) {
            const p = ws.dados['anaPausa'] as PausaIA | undefined;
            return { error: null, data: f['dados->anaPausa->>ativa'] === 'true' && p?.ativa ? [{ owner_id: 'owner-1', pausa: clone(p) }] : [] };
          }
          return { error: null, data: single ? { dados: clone(ws.dados), updated_at: String(ws.rev) } : null };
        }
        if (table === 'atendimento_contatos_teste') return { error: null, data: [{ conversa_id: 'caso-1' }] };
        if (table === 'casos') {
          if (patch) {
            if (f['updated_at'] !== String(caso.rev)) return { error: null, data: [] };
            caso.dados = clone(patch.dados) as Conversa; caso.rev++;
            return { error: null, data: [{ id: 'caso-1' }] };
          }
          if (single) return { error: null, data: { owner_id: caso.owner_id, dados: clone(caso.dados), updated_at: String(caso.rev) } };
          return { error: null, data: f['owner_id'] && f['owner_id'] !== caso.owner_id ? [] : [{ id: 'caso-1', dados: clone(caso.dados) }] };
        }
        return { error: null, data: null };
      };
      const q = {
        select: (s?: string) => { if (s && !patch) cols = s; return q; },
        eq: (col: string, val: unknown) => { f[col] = val; return q; },
        in: () => q,
        update: (v: { dados: unknown }) => { patch = v; return q; },
        single: async () => exec(true), maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec(false)).then(res, rej),
      };
      return q;
    },
    rpc: async (_nome: string, args: Record<string, unknown>) => { audit.push(args); return { error: null }; },
  };
  return { db: db as unknown as SupabaseClient<Database>, ws: () => ws.dados, ler: () => caso.dados, audit };
}

describe('retomada automática pelo monitor de 5 minutos', () => {
  const PAUSA: PausaIA = { ativa: true, motivo: 'O Claude recusou a chave de acesso (ANTHROPIC_API_KEY).', desde: antes(30) };
  it('sem pausa: não testa a chave', async () => {
    const testar = vi.fn();
    const { db } = criarBanco(conversa());
    expect(await verificarPausaIA(db, AGORA, testar)).toEqual({ pausadas: 0 });
    expect(testar).not.toHaveBeenCalled();
  });
  it('chave ainda recusada: etapa falha com o motivo e nada muda', async () => {
    const { db, ws, ler } = criarBanco(conversa(), PAUSA);
    await expect(verificarPausaIA(db, AGORA, async () => ({ ok: false, motivo: 'O Claude ainda recusa a chave de acesso.' }))).rejects.toThrow('IA pausada: O Claude ainda recusa a chave de acesso.');
    expect(ws()['anaPausa']).toEqual(PAUSA);
    expect(ler().mensagens.at(-1)?.iaExecucao).toBeUndefined();
  });
  it('chave aceita: desliga a pausa preservando a área de trabalho, devolve a mensagem à fila e audita', async () => {
    const { db, ws, ler, audit } = criarBanco(conversa(), PAUSA);
    expect(await verificarPausaIA(db, AGORA, async () => ({ ok: true }))).toEqual({ pausadas: 1, retomadas: 1, reenfileiradas: 1 });
    expect(ws()).not.toHaveProperty('anaPausa');
    expect(ws()['training']).toEqual(defaultState.training);
    const m = ler().mensagens.at(-1)!;
    expect(m.iaExecucao).toMatchObject({ estado: 'aguardando', retryEm: AGORA.toISOString() });
    expect(podeExecutarAna(m, AGORA.getTime())).toBe(true);
    expect(audit.some(a => a['p_acao'] === 'pausaIA' && String(a['p_resumo']).includes('1 mensagem(ns)'))).toBe(true);
  });
  it('conversa com a equipe no controle continua com a equipe', async () => {
    const { db, ler } = criarBanco(conversa({}, { humano: true }), PAUSA);
    expect(await verificarPausaIA(db, AGORA, async () => ({ ok: true }))).toEqual({ pausadas: 1, retomadas: 1, reenfileiradas: 0 });
    expect(ler().mensagens.at(-1)?.iaExecucao).toBeUndefined();
  });
});

/** Mesmo cenário de `confirmacao-consulta-resposta.test.ts`, com a área de trabalho gravável. */
function cenarioAnne(texto: string, pausa?: PausaIA) {
  const inicio = '2026-11-25T17:30:00.000Z';
  const messageId = `ultramsg:${telefone}:resp-1`;
  let saved: Conversa = {
    ...base, id: 'caso-conf', modoIA: 'Automática', tipoClienteAgenda: 'novo', consultaAgendada: inicio, timeline: [],
    agenteAna: {
      apresentado: true, telefone, tipoCliente: 'novo', dados: { nome: 'Maria Teste', cpf: '', assunto: 'Consulta', email: '' },
      reservaCalendar: { id: 'evt-1', inicio, fim: '2026-11-25T18:00:00.000Z' },
      confirmacao40: { inicio, reservadoEm: '2026-11-25T16:45:00.000Z', enviadoEm: '2026-11-25T16:45:00.000Z', idExterno: 'wamid-conf' },
    },
    mensagens: [
      { id: 'conf', de: 'escritorio', canal: 'ultramsg', texto: 'Olá\nBoa tarde ! 😊\n📍Passando para confirmar o seu atendimento hoje às 14h30, ok?!\nEquipe CS Advocacia ⚖️\nLawyers', hora: '13:45', idExterno: 'wamid-conf', status: 'enviada' },
      { id: messageId, de: 'cliente', canal: 'ultramsg', texto, hora: '13:47', dataHora: AGORA.toISOString() },
    ],
  };
  let ws: OfficeState = { ...clone(defaultState), ...(pausa ? { anaPausa: pausa } : {}) };
  const config = { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true };
  const contato = { contato_externo: telefone, telefone_ficticio: telefone, status: 'liberado' };
  const db = {
    from(table: string) {
      let patch: { dados: unknown } | undefined;
      const result = () => {
        if (table === 'casos') {
          if (patch) { saved = clone(patch.dados) as Conversa; return { error: null, data: [{ id: 'caso-conf' }] }; }
          return { error: null, data: { owner_id: 'owner-1', dados: clone(saved), updated_at: 'rev' } };
        }
        if (table === 'office_workspace') {
          if (patch) { ws = clone(patch.dados) as OfficeState; return { error: null, data: [{ owner_id: 'owner-1' }] }; }
          return { error: null, data: { dados: clone(ws), updated_at: 'ws-rev' } };
        }
        return { error: null, data: table === 'checklist_itens' ? [] : table === 'atendimento_canal_config' ? config : contato };
      };
      const q = {
        select: () => q, eq: () => q,
        update: (v: { dados: unknown }) => { patch = v; return q; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => saved, ws: () => ws, messageId };
}

describe('Anne com a IA pausada', () => {
  const PAUSA: PausaIA = { ativa: true, motivo: 'O Claude recusou a chave de acesso (ANTHROPIC_API_KEY).', desde: antes(20) };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-resp' });
    mocks.gerar.mockResolvedValue({ acao: 'enviar', mensagem: 'Entendi.', motivo_aprovacao: '', intencao: 'duvida_geral', urgente: false, encaminhar_humano: false, dados_coletados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' }, proximo_passo: '' });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('"ok" à confirmação de presença é registrado e respondido com o texto fixo, sem chamar o Claude', async () => {
    const { db, ler, messageId } = cenarioAnne('ok', PAUSA);
    await processarAna(db, 'caso-conf', messageId, new Request('http://localhost'));
    expect(mocks.gerar).not.toHaveBeenCalled();
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toBe('Presença confirmada! Sua consulta continua hoje, às 14h30.');
    expect(ler().agenteAna?.confirmacao40).toMatchObject({ resposta: 'sim' });
  });
  it('pergunta que exige o modelo espera a retomada: nada sai e a conversa não passa para a equipe', async () => {
    const { db, ler, messageId } = cenarioAnne('Qual documento preciso levar?', PAUSA);
    await processarAna(db, 'caso-conf', messageId, new Request('http://localhost'));
    expect(mocks.gerar).not.toHaveBeenCalled();
    expect(mocks.enviar).not.toHaveBeenCalled();
    const c = ler();
    expect(c.agenteAna?.humano).toBeFalsy();
    expect(c.mensagens.at(-1)?.iaExecucao).toMatchObject({ estado: 'aguardando', tentativas: 0 });
    expect(mensagemParaRetomar(c, PAUSA, AGORA.getTime())).toBe(messageId);
  });
  it('chave recusada no meio do atendimento: pausa com início gravado e a mensagem espera, sem transferir para a equipe', async () => {
    mocks.gerar.mockRejectedValue(Object.assign(new Error('A chave da API do Claude foi recusada. Confira ANTHROPIC_API_KEY.'), { code: 'chave_invalida' }));
    const { db, ler, ws, messageId } = cenarioAnne('Qual documento preciso levar?');
    await processarAna(db, 'caso-conf', messageId, new Request('http://localhost'));
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ws().anaPausa).toEqual({ ativa: true, motivo: 'O Claude recusou a chave de acesso (ANTHROPIC_API_KEY).', desde: AGORA.toISOString() });
    const c = ler();
    expect(c.agenteAna?.humano).toBeFalsy();
    expect(c.agenteAna?.pausa).toBeFalsy();
    expect(c.mensagens.at(-1)?.iaExecucao).toMatchObject({ estado: 'aguardando', tentativas: 0 });
    expect(mensagemParaRetomar(c, ws().anaPausa, AGORA.getTime())).toBe(messageId);
  });
});
