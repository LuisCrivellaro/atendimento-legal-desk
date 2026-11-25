import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';
import { DEFAULT_REPLIES } from '@/lib/respostas-prontas';
import {
  PERGUNTA_ENCERRAMENTO, chaveEvento, dataHoraDoEvento, deveEnviarEncerramento, encerramentoRespondivel, eventoPodeAvisar,
  rascunhoAvisoEvento, respostaEncerramento, tipoEventoProcessual, type EventoOficial,
} from '@/lib/atendimento/acompanhamento';
import { eventoAtual, criarAvisosEventos } from '@/lib/atendimento/acompanhamento.server';
import { pendencias, mensagemRevisora, type PedidoProcesso } from '@/lib/atendimento/consulta-processo';
import { processarAna } from '@/lib/atendimento/ana.server';

const mocks = vi.hoisted(() => ({ gerar: vi.fn(), enviar: vi.fn(), ocupados: vi.fn(), revisora: vi.fn() }));
vi.mock('@/lib/atendimento/ana-relacionamento.server', () => ({ reconhecerRelacionamentoAna: async () => ({ identidade: { tipo: 'nao_encontrado' }, rel: { situacao: 'ativo', consultaInicial: false, quantidadeProcessos: 1 }, nome: '' }) }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));
vi.mock('@/lib/atendimento/consulta-processo.server', () => ({ fluxoProcessoReal: async () => false, enviarAvisoProcesso: vi.fn(), reservarCodigo: async () => [] }));
vi.mock('@/lib/atendimento/projuris-agenda.server', () => ({ ocupadosAgenda: (...a: unknown[]) => (mocks.ocupados as (...x: unknown[]) => unknown)(...a), reservarAgenda: vi.fn(), remarcarAgenda: vi.fn(), cancelarAgenda: vi.fn() }));
vi.mock('@/lib/atendimento/canais/ultramsg', () => ({ enviarTextoRevisora: mocks.revisora }));
const procFicticio = { codigo: 77, numero: '0000000-00.2026.5.02.0000', vara: '1ª Vara do Trabalho Fictícia', assunto: 'Verbas rescisórias', segredoJustica: false, envolvidos: [{ codigoPessoa: 501, cliente: true }] };
vi.mock('@/lib/projuris/base.server', () => ({ lerBase: async () => ({ base: { processos: {} } }) }));
vi.mock('@/lib/projuris/base', () => ({ processosDaBase: () => [{ codigoProcesso: 77 }] }));
vi.mock('@/lib/projuris/mapeamento', () => ({ processoDe: () => procFicticio }));

const modelos = { audiencia: DEFAULT_REPLIES.find(r => r.atalho === 'audiencia')?.texto ?? '', pericia: DEFAULT_REPLIES.find(r => r.atalho === 'pericia')?.texto ?? '' };
const evento = (e: Partial<EventoOficial> = {}): EventoOficial => ({ codigoProcesso: 77, tipo: 'audiencia', descricao: 'Audiência de instrução designada para 10/12/2026 às 14:30', privado: false, segredoJustica: false, ...e });

describe('pergunta de encerramento (S3, D4 proposto)', () => {
  it('uma vez por notícia pedida pelo cliente; nunca para lista, aviso de evento ou recusa', () => {
    expect(deveEnviarEncerramento({ codigo: 'AND-0001' }, 'aprovar')).toBe(true);
    expect(deveEnviarEncerramento({ codigo: 'AND-0001' }, 'corrigir')).toBe(true);
    expect(deveEnviarEncerramento({ codigo: 'AND-0001' }, 'recusar')).toBe(false);
    expect(deveEnviarEncerramento({ codigo: 'AND-0001', selecaoProcessos: [1] }, 'aprovar')).toBe(false);
    expect(deveEnviarEncerramento({ codigo: 'AND-0001', evento: { tipo: 'audiencia', chave: 'x' } }, 'aprovar')).toBe(false);
    expect(deveEnviarEncerramento({ codigo: 'AND-0001' }, 'aprovar', { codigo: 'AND-0001', reservadoEm: 'x' })).toBe(false);
  });
  it.each(['sim', 'Sim, por favor', 'quero', 'pode verificar', 'gostaria'])('"%s" pede horários', t => expect(respostaEncerramento(t)).toBe('sim'));
  it.each(['não', 'sim, esclareceu', 'esclareceu, obrigada', 'entendi', 'tudo certo'])('"%s" encerra', t => expect(respostaEncerramento(t)).toBe('nao'));
  it('só vale enquanto for a última mensagem do escritório', () => {
    const c = { mensagens: [{ id: 'q', de: 'escritorio' as const, canal: 'ultramsg', texto: PERGUNTA_ENCERRAMENTO.texto, hora: '', idExterno: 'w1' }], agenteAna: { encerramentoProcesso: { codigo: 'AND-1', reservadoEm: '2026-11-25T12:00:00Z', enviadoEm: '2026-11-25T12:00:00Z', idExterno: 'w1' } } };
    expect(encerramentoRespondivel(c, 'ultramsg', new Date('2026-11-25T13:00:00Z'))).toBe(true);
    expect(encerramentoRespondivel({ ...c, mensagens: [...c.mensagens, { id: 'o', de: 'escritorio' as const, canal: 'ultramsg', texto: 'outra', hora: '', idExterno: 'w2' }] }, 'ultramsg', new Date('2026-11-25T13:00:00Z'))).toBe(false);
  });
});

describe('aviso de audiência e perícia', () => {
  it('detecta tipo e lê data/hora só do texto do registro', () => {
    expect(tipoEventoProcessual('Audiência de instrução designada')).toBe('audiencia');
    expect(tipoEventoProcessual('Perícia médica agendada')).toBe('pericia');
    expect(tipoEventoProcessual('Juntada de petição')).toBeUndefined();
    expect(dataHoraDoEvento('designada para 10/12/2026 às 14:30')).toEqual({ data: '10/12/2026', hora: '14h30' });
    expect(dataHoraDoEvento('Audiência redesignada; aguardando nova data')).toEqual({});
  });
  it('andamento privado ou processo em segredo de justiça nunca gera aviso', () => {
    expect(eventoPodeAvisar(evento())).toBe(true);
    expect(eventoPodeAvisar(evento({ privado: true }))).toBe(false);
    expect(eventoPodeAvisar(evento({ segredoJustica: true }))).toBe(false);
  });
  it('deduplica por processo, tipo, data e hora; data alterada gera nova chave', () => {
    expect(chaveEvento(evento({ data: '10/12/2026', hora: '14h30' }))).toBe(chaveEvento(evento({ data: '10/12/2026', hora: '14h30', descricao: 'outro texto' })));
    expect(chaveEvento(evento({ data: '11/12/2026', hora: '14h30' }))).not.toBe(chaveEvento(evento({ data: '10/12/2026', hora: '14h30' })));
  });
  it('rascunho usa o modelo oficial e tira o que falta, sem inventar', () => {
    const t = rascunhoAvisoEvento(evento({ data: '10/12/2026', hora: '14h30', numero: '0000000-00.2026.5.02.0000', vara: '1ª Vara' }), 'MARIA souza', modelos);
    expect(t).toContain('Oi, Maria! 😊');
    expect(t).toContain('no dia 10/12/2026 às 14h30.');
    expect(t).toContain('📌 Processo: 0000000-00.2026.5.02.0000');
    expect(t).not.toMatch(/\{[a-z_]+\}/);
    expect(t).not.toContain('Local da audiência');
    const pericia = rascunhoAvisoEvento(evento({ tipo: 'pericia', data: '05/01/2027' }), 'João', modelos);
    expect(pericia).toContain('📆 Data: 05/01/2027');
    expect(pericia).not.toContain('Horário:');
    expect(pericia).not.toContain('Endereço:');
  });
  it('só evento atual: data futura do registro, ou andamento recente sem data', () => {
    const agora = new Date('2026-11-25T12:00:00Z');
    expect(eventoAtual({ data: '10/12/2026' }, undefined, agora)).toBe(true);
    expect(eventoAtual({ data: '10/10/2026' }, undefined, agora)).toBe(false);
    expect(eventoAtual({}, '2026-11-24T10:00:00Z', agora)).toBe(true);
    expect(eventoAtual({}, '2026-10-01T10:00:00Z', agora)).toBe(false);
  });
  it('pedido de evento não manda "em conferência" ao cliente e a revisora vê que é aviso proativo', () => {
    const p: PedidoProcesso = { codigo: 'AND-0009', conversaId: 'c', contato: { nome: 'Maria', telefone: '5511900000004' }, identificadoPor: 'x', processos: [], textoProposto: 't', hash: 'h', rascunhoPadrao: true, status: 'pendente', criadoEm: '2026-11-25T10:00:00Z', lembretesEm: [], evento: { tipo: 'audiencia', chave: 'k' } };
    expect(pendencias(p, new Date('2026-11-25T18:00:00Z')).avisoCliente).toBeUndefined();
    expect(mensagemRevisora(p)).toMatch(/aviso de audiência registrado no ProJuris \(o cliente não perguntou/);
  });
});

function criarDbConversa(c: Conversa) {
  let saved = c;
  const tabelas: Record<string, unknown> = { checklist_itens: [], office_workspace: { dados: defaultState }, atendimento_canal_config: { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true }, atendimento_contatos_teste: { contato_externo: '5511900000004', telefone_ficticio: '5511900000004', status: 'liberado' } };
  const db = {
    from(table: string) {
      let patch: { dados: Conversa } | undefined;
      const result = () => {
        if (table === 'casos') {
          if (patch) { saved = JSON.parse(JSON.stringify(patch.dados)) as Conversa; return { error: null, data: [{ id: c.id }] }; }
          return { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(saved)) as Conversa, updated_at: 'rev' } };
        }
        return { error: null, data: tabelas[table] ?? null };
      };
      const q = { select: () => q, eq: () => q, update: (v: { dados: Conversa }) => { patch = v; return q; }, single: async () => result(), maybeSingle: async () => result(), then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res) };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => saved };
}

const fixture = conversas[2];
if (!fixture) throw new Error('fixture');
const base: Conversa = fixture;

describe('resposta à pergunta de encerramento (servidor)', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
    mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'w-resp' });
    mocks.ocupados.mockResolvedValue([]);
    mocks.gerar.mockResolvedValue({ acao: 'enviar', mensagem: 'Certo!', motivo_aprovacao: '', intencao: 'duvida_geral', urgente: false, encaminhar_humano: false, dados_coletados: { nome: 'Helena', cpf: '', assunto: '', email: '' }, proximo_passo: '' });
  });
  afterEach(() => { vi.useRealTimers(); });
  const conversa = (texto: string): Conversa => ({
    ...base, id: 'c-enc', modoIA: 'Automática', tipoClienteAgenda: 'cadastrado', consultaAgendada: undefined, timeline: [],
    agenteAna: { apresentado: true, telefone: '5511900000004', dados: { nome: 'Helena', cpf: '', assunto: '', email: '' }, encerramentoProcesso: { codigo: 'AND-0001', reservadoEm: '2026-11-25T14:00:00Z', enviadoEm: '2026-11-25T14:00:00Z', idExterno: 'w-q' } },
    mensagens: [{ id: 'q', de: 'escritorio', canal: 'ultramsg', texto: PERGUNTA_ENCERRAMENTO.texto, hora: '11:00', idExterno: 'w-q', status: 'enviada' }, { id: 'ultramsg:5511900000004:r1', de: 'cliente', canal: 'ultramsg', texto, hora: '12:00', dataHora: '2026-11-25T15:00:00Z' }],
  });
  it('"sim": consulta a agenda e oferece horários de sexta (cliente da casa)', async () => {
    const { db, ler } = criarDbConversa(conversa('sim'));
    await processarAna(db, 'c-enc', 'ultramsg:5511900000004:r1', new Request('http://localhost'));
    expect(mocks.ocupados).toHaveBeenCalledOnce();
    const texto = mocks.enviar.mock.calls[0]?.[0].texto as string;
    expect(texto).toMatch(/^Tenho estes horários livres na agenda:/);
    expect(texto).toMatch(/Sexta/i);
    expect(ler().agenteAna?.encerramentoProcesso).toMatchObject({ resposta: 'sim' });
  });
  it('"esclareceu, obrigada": nada mais é enviado', async () => {
    const { db, ler } = criarDbConversa(conversa('esclareceu, obrigada'));
    await processarAna(db, 'c-enc', 'ultramsg:5511900000004:r1', new Request('http://localhost'));
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.ocupados).not.toHaveBeenCalled();
    expect(ler().agenteAna?.encerramentoProcesso).toMatchObject({ resposta: 'nao' });
  });
});

describe('aviso de audiência na sincronização (servidor)', () => {
  it('cria um rascunho na fila da revisora para o cliente com vínculo confirmado; repetir não duplica', async () => {
    vi.clearAllMocks();
    mocks.revisora.mockResolvedValue({ ok: true });
    const cliente: Conversa = { ...base, id: 'c-ev', agenteAna: { telefone: '5511900000004', vinculoProjuris: { codigoPessoa: 501, nome: 'HELENA FICTÍCIA', status: 'confirmado', origem: 'telefone', desde: '2026-11-01T00:00:00Z' } } };
    let saved = cliente;
    const db = {
      from(table: string) {
        let patch: { dados: Conversa } | undefined;
        const result = (single: boolean) => {
          if (table === 'casos') {
            if (patch) { saved = JSON.parse(JSON.stringify(patch.dados)) as Conversa; return { error: null, data: [{ id: 'c-ev' }] }; }
            return single ? { error: null, data: { dados: saved, updated_at: 'r' } } : { error: null, data: [{ id: 'c-ev', dados: saved }] };
          }
          if (table === 'office_workspace') return { error: null, data: { dados: defaultState } };
          return { error: null, data: null };
        };
        const q = { select: () => q, eq: () => q, update: (v: { dados: Conversa }) => { patch = v; return q; }, single: async () => result(true), maybeSingle: async () => result(true), then: (res: (v: unknown) => unknown) => Promise.resolve(result(false)).then(res) };
        return q;
      },
      rpc: async () => ({ error: null }),
    } as unknown as SupabaseClient<Database>;
    const movs = [{ codigo: 1, data: '2026-11-24T10:00:00Z', descricao: 'Audiência de instrução designada para 10/12/2026 às 14:30', privado: false }, { codigo: 2, data: '2026-11-24T10:00:00Z', descricao: 'Juntada de procuração', privado: false }, { codigo: 3, data: '2026-11-24T10:00:00Z', descricao: 'Perícia designada para 12/12/2026', privado: true }];
    expect(await criarAvisosEventos(db, 'owner-1', 77, movs, new Date('2026-11-25T12:00:00Z'))).toEqual({ criados: 1 });
    const pedido = saved.agenteAna?.pedidosProcesso?.[0];
    expect(pedido).toMatchObject({ status: 'pendente', evento: { tipo: 'audiencia' } });
    expect(pedido?.textoProposto).toContain('no dia 10/12/2026 às 14h30.');
    expect(mocks.revisora).toHaveBeenCalledOnce();
    expect(await criarAvisosEventos(db, 'owner-1', 77, movs, new Date('2026-11-25T12:30:00Z'))).toEqual({ criados: 0 });
  });
});
