// Encaminhamento de clientes ativos ao advogado responsável (Fernando) e relatório às 09h/16h no WhatsApp dele.
// Nenhum disparo real: integrações substituídas (ProJuris, modelo, UltraMsg e banco em memória).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa, type Mensagem } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';
import type { AnaResult } from '@/lib/atendimento/ana-rules';
import type { ProcessoPJ } from '@/lib/projuris/processos';
import {
  decidirEncaminhamento, encaminhamentoAberto, encaminhamentoPendente, horarioRelatorioDevido, itensRelatorioAdvogado, marcarEncaminhamento, mensagemEncaminhamento,
  mensagemSemConteudo, primeiroNomeCliente, processoRelacionado, registrarEncaminhamento, respostaEfetivaEquipe, resumoSolicitacao, sinaisFluxoAnne, statusEncaminhamento,
  textoRelatorioAdvogado, type DadosEncaminhamento, type EncaminhamentoAdvogado,
} from '@/lib/atendimento/encaminhamento-advogado';
import { lerConfigEncaminhamento, whatsappResponsavelValido, CONFIG_ENCAMINHAMENTO_PADRAO } from '@/lib/atendimento/secretaria/encaminhamento-config';
import { lerConfigSecretaria } from '@/lib/atendimento/secretaria/config';
import { esquemaConfigSecretaria } from '@/lib/atendimento/secretaria/config-schema';
import { enviarRelatoriosAdvogado, planoRelatorio, idRelatorio, type EstadoRelatorioAdvogado } from '@/lib/atendimento/relatorio-advogado.server';
import { enviarTextoResponsavel } from '@/lib/atendimento/canais/ultramsg';
import { processarAna } from '@/lib/atendimento/ana.server';

const mocks = vi.hoisted(() => ({ indice: vi.fn(), ativos: vi.fn(), gerar: vi.fn(), enviar: vi.fn(), agenda: vi.fn(), fluxo: vi.fn(), base: vi.fn() }));
vi.mock('@/lib/projuris/indice.server', () => ({ identificarClienteProjuris: mocks.indice }));
vi.mock('@/lib/projuris/consultas.server', () => ({ criarConsultasProjuris: () => ({ processosAtivos: mocks.ativos }) }));
vi.mock('@/lib/projuris/base.server', () => ({ lerBase: mocks.base }));
vi.mock('@/lib/atendimento/ana.functions', () => ({ gerarRespostaAna: mocks.gerar }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));
vi.mock('@/lib/atendimento/projuris-agenda.server', () => ({ ocupadosAgenda: mocks.agenda, reservarAgenda: mocks.agenda }));
vi.mock('@/lib/atendimento/consulta-processo.server', () => ({ fluxoProcessoReal: mocks.fluxo }));
afterEach(() => vi.useRealTimers());

const TEL = '5511990000001';
const base = conversas[0];
if (!base) throw new Error('Fixture ausente');
const { contrato: _c, ...limpa } = base;
const conversa = (extra: Partial<Conversa> = {}): Conversa => ({ ...limpa, id: '11111111-1111-4111-8111-111111111111', telefone: TEL, etapa: 'ativo', processos: [], mensagens: [], timeline: [], agenteAna: {}, ...extra });
const msg = (id: string, de: Mensagem['de'], texto: string, quando: string, extra: Partial<Mensagem> = {}): Mensagem => ({ id, de, texto, canal: 'ultramsg', hora: '', dataHora: quando, ...extra });
const EQUIPE = { autor: 'Fernando' };
const ANNE = { autor: 'Ana · assistente virtual' };
const proc = (codigo: number, numero: string, assunto: string, vara: string, segredoJustica = false): ProcessoPJ => ({ codigo, numero, assunto, vara, orgao: vara.includes('Trabalho') ? 'TRT-2' : 'TJSP', segredoJustica, envolvidos: [] });
const resultado = (mensagem: string, intencao: AnaResult['intencao'] = 'duvida_geral'): AnaResult => ({ acao: 'enviar', mensagem, intencao, urgente: false, encaminhar_humano: false, motivo_aprovacao: '', proximo_passo: '', dados_coletados: { nome: '', cpf: '', assunto: '', email: '' } });
const dados = (mensagemId: string, texto: string, extra: Partial<DadosEncaminhamento> = {}): DadosEncaminhamento => ({ conversaId: 'conv', mensagemId, texto, responsavel: 'Fernando', nomeCliente: 'Marina Fictícia Souza', telefone: TEL, processo: '', aviso: 'enviando', ...extra });
const FIXA = 'Já iremos retornar sua mensagem 😊\n📍 Por gentileza, nos informe a sua solicitação/ dúvida que encaminharemos para o advogado retornar assim que possível.';

describe('mensagem obrigatória (correspondência exata)', () => {
  it('com nome: só o nome muda; sem nome: só "Olá,"', () => {
    expect(mensagemEncaminhamento('Marina')).toBe(`Olá, Marina\n${FIXA}`);
    expect(mensagemEncaminhamento(undefined)).toBe(`Olá,\n${FIXA}`);
    expect(mensagemEncaminhamento('  ')).toBe(`Olá,\n${FIXA}`);
    expect(mensagemEncaminhamento('Marina')).toMatchInlineSnapshot(`
      "Olá, Marina
      Já iremos retornar sua mensagem 😊
      📍 Por gentileza, nos informe a sua solicitação/ dúvida que encaminharemos para o advogado retornar assim que possível."
    `);
  });
  it('nome nunca inventado: só de cadastro/nome registrado, primeiro nome, nunca rótulo do WhatsApp', () => {
    expect(primeiroNomeCliente('MARINA FICTÍCIA SOUZA')).toBe('Marina');
    expect(primeiroNomeCliente(undefined, 'Joana')).toBe('Joana');
    expect(primeiroNomeCliente('WhatsApp 5511990000001')).toBeUndefined();
    expect(primeiroNomeCliente('RT - 12345 - CARLOS EXEMPLO')).toBe('Carlos');
    expect(primeiroNomeCliente('', '123')).toBeUndefined();
  });
});

describe('decisão: o que vai para o advogado e o que fica com a Anne', () => {
  const semSinal = { agenda: false, processo: false, coleta: false };
  const base = { ligado: true, modo: 'Automática', situacao: 'ativo', texto: 'Tenho uma dúvida sobre o meu caso', material: false, sinais: semSinal, cobranca: false, aberto: false };
  it('cliente ativo com dúvida → encaminhar; com pendência aberta → só atualizar', () => {
    expect(decidirEncaminhamento(base)).toBe('encaminhar');
    expect(decidirEncaminhamento({ ...base, aberto: true })).toBe('atualizar');
  });
  it('novos leads, ex-clientes, vínculo em conferência, outros modos e encaminhamento desligado: fluxo atual', () => {
    for (const situacao of ['novo_lead', 'cadastro_anterior', 'incerto', 'em_atendimento']) expect(decidirEncaminhamento({ ...base, situacao })).toBeUndefined();
    expect(decidirEncaminhamento({ ...base, modo: 'Sugerir' })).toBeUndefined();
    expect(decidirEncaminhamento({ ...base, ligado: false })).toBeUndefined();
  });
  it('agenda, notícia de processo, coleta, mídia e cobrança sem pendência ficam com a Anne', () => {
    expect(decidirEncaminhamento({ ...base, sinais: { ...semSinal, agenda: true } })).toBeUndefined();
    expect(decidirEncaminhamento({ ...base, sinais: { ...semSinal, processo: true } })).toBeUndefined();
    expect(decidirEncaminhamento({ ...base, sinais: { ...semSinal, coleta: true } })).toBeUndefined();
    expect(decidirEncaminhamento({ ...base, material: true })).toBeUndefined();
    expect(decidirEncaminhamento({ ...base, cobranca: true })).toBeUndefined();
    expect(decidirEncaminhamento({ ...base, cobranca: true, aberto: true })).toBe('atualizar');
  });
  it('reagendamentos, confirmações e lembretes são reconhecidos como agenda', () => {
    const agora = new Date('2026-11-26T15:00:00Z');
    const comConsulta = conversa({ consultaAgendada: '2026-11-27T17:00:00Z' });
    for (const t of ['quero remarcar minha consulta', 'preciso cancelar a consulta de sexta', 'tem outro horário?', 'sim', 'não']) expect(sinaisFluxoAnne(comConsulta, t, 'ultramsg', {}, agora).agenda, t).toBe(true);
    expect(sinaisFluxoAnne(conversa(), 'quero falar com a Dra. Carolina', 'ultramsg', {}, agora).agenda).toBe(false);
    expect(sinaisFluxoAnne(conversa(), 'como está meu processo?', 'ultramsg', {}, agora).processo).toBe(true);
    expect(sinaisFluxoAnne(conversa({ agenteAna: { aguardandoAssuntoProcesso: true } }), 'o trabalhista', 'ultramsg', {}, agora).processo).toBe(true);
  });
});

describe('fila: pendência única, situação derivada das mensagens reais', () => {
  const t = (min: number) => new Date(Date.parse('2026-11-26T12:00:00Z') + min * 60000).toISOString();
  const abrir = (msgs: Mensagem[]) => registrarEncaminhamento(conversa({ mensagens: msgs }), dados(msgs[0]!.id, msgs[0]!.texto), 'ultramsg', new Date(t(0)));
  it('cria uma pendência com responsável, status, telefone e mensagem; segunda mensagem só atualiza (sem nova mensagem fixa)', () => {
    const r1 = abrir([msg('a', 'cliente', 'Olá', t(0))]);
    expect(r1.novo).toBe(true); expect(r1.enviar).toBe(true);
    expect(r1.encaminhamento).toMatchObject({ responsavel: 'Fernando', status: 'aguardando', telefone: TEL, mensagemOrigemId: 'a', motivo: 'saudacao' });
    const c2 = { ...r1.conversa, mensagens: [...r1.conversa.mensagens, msg('b', 'cliente', 'Recebi uma intimação, o que faço?', t(1))] };
    const r2 = registrarEncaminhamento(c2, dados('b', 'Recebi uma intimação, o que faço?'), 'ultramsg', new Date(t(1)));
    expect(r2.novo).toBe(false); expect(r2.enviar).toBe(false); expect(r2.conversa.encaminhamentos).toHaveLength(1);
    expect(r2.encaminhamento.mensagensCliente).toEqual(['a', 'b']); expect(r2.encaminhamento.motivo).toBe('solicitacao');
    expect(resumoSolicitacao(r2.encaminhamento, r2.conversa)).toBe('Recebi uma intimação, o que faço?');
  });
  it('só saudação: resumo indica que a solicitação ainda não foi informada', () => {
    const r = abrir([msg('a', 'cliente', 'Bom dia!', t(0))]);
    expect(resumoSolicitacao(r.encaminhamento, r.conversa)).toBe('Ainda não informada (o cliente só cumprimentou).');
  });
  it('saudação da equipe não resolve; resposta efetiva tira da lista; nova dúvida do cliente devolve à fila', () => {
    const r = abrir([msg('a', 'cliente', 'Preciso falar com a Dra. sobre a audiência', t(0))]);
    const com = (...m: Mensagem[]) => ({ ...r.conversa, mensagens: [...r.conversa.mensagens, ...m] });
    const e = r.encaminhamento;
    expect(statusEncaminhamento(e, com())).toBe('aguardando');
    expect(statusEncaminhamento(e, com(msg('e1', 'escritorio', 'Boa tarde, Marina!', t(5), EQUIPE)))).toBe('em_atendimento');
    expect(statusEncaminhamento(e, com(msg('e1', 'escritorio', 'Vou verificar e já te retorno.', t(5), EQUIPE)))).toBe('em_atendimento');
    const respondida = com(msg('e1', 'escritorio', 'Marina, a audiência continua marcada; leve documento com foto e chegue 30 minutos antes.', t(5), EQUIPE));
    expect(statusEncaminhamento(e, respondida)).toBe('respondido');
    expect(encaminhamentoPendente(respondida, 'ultramsg', new Date(t(6)))).toBeUndefined();
    expect(statusEncaminhamento(e, { ...respondida, mensagens: [...respondida.mensagens, msg('c', 'cliente', 'obrigada!', t(7))] })).toBe('respondido');
    expect(statusEncaminhamento(e, { ...respondida, mensagens: [...respondida.mensagens, msg('c', 'cliente', 'E posso levar testemunha?', t(8))] })).toBe('aguardando');
    // Mensagem da própria Anne nunca conta como resposta da equipe.
    expect(statusEncaminhamento(e, com(msg('x', 'escritorio', 'Marina, a audiência continua marcada; leve documento com foto.', t(5), { ...ANNE, respostaAnaDe: 'a' })))).toBe('aguardando');
  });
  it('Fernando assume e conclui: concluída não reabre e o próximo contato abre outra pendência', () => {
    const r = abrir([msg('a', 'cliente', 'Tenho uma dúvida', t(0))]);
    const assumida = marcarEncaminhamento(r.conversa, r.encaminhamento.id, 'em_atendimento', 'Fernando', new Date(t(2)));
    expect(assumida.ok).toBe(true);
    expect(statusEncaminhamento(assumida.conversa.encaminhamentos![0]!, assumida.conversa)).toBe('em_atendimento');
    const concluida = marcarEncaminhamento(assumida.conversa, r.encaminhamento.id, 'concluido', 'Fernando', new Date(t(3)));
    expect(statusEncaminhamento(concluida.conversa.encaminhamentos![0]!, concluida.conversa)).toBe('concluido');
    expect(marcarEncaminhamento(concluida.conversa, r.encaminhamento.id, 'em_atendimento', 'X').ok).toBe(false);
    expect(encaminhamentoAberto(concluida.conversa)).toBeUndefined();
    const nova = registrarEncaminhamento({ ...concluida.conversa, mensagens: [...concluida.conversa.mensagens, msg('z', 'cliente', 'Outra dúvida', t(60))] }, dados('z', 'Outra dúvida'), 'ultramsg', new Date(t(60)));
    expect(nova.novo).toBe(true); expect(nova.enviar).toBe(true); expect(nova.conversa.encaminhamentos).toHaveLength(2);
  });
  it('aviso "enviando" (em curso) nunca é reservado de novo; "nao_enviado" volta a sair pela próxima mensagem', () => {
    const r = abrir([msg('a', 'cliente', 'Oi', t(0))]);
    const c = { ...r.conversa, mensagens: [...r.conversa.mensagens, msg('b', 'cliente', 'tem alguém?', t(1))] };
    expect(registrarEncaminhamento(c, dados('b', 'tem alguém?'), 'ultramsg', new Date(t(1))).enviar).toBe(false);
    const naoEnviado = { ...c, encaminhamentos: c.encaminhamentos!.map(e => ({ ...e, aviso: { ...e.aviso, estado: 'nao_enviado' as const } })) };
    expect(registrarEncaminhamento(naoEnviado, dados('b', 'tem alguém?'), 'ultramsg', new Date(t(1))).enviar).toBe(true);
  });
  it('mensagens sem conteúdo e respostas efetivas', () => {
    for (const s of ['ok', 'Obrigada!', '👍', 'Bom dia', 'blz']) expect(mensagemSemConteudo(s), s).toBe(true);
    expect(mensagemSemConteudo('Quero saber se preciso ir à audiência')).toBe(false);
    for (const s of ['Oi, Marina!', 'Vou verificar', 'Um momento, por favor', 'Bom dia! Já te retorno']) expect(respostaEfetivaEquipe(s), s).toBe(false);
    expect(respostaEfetivaEquipe('Sim, pode levar a testemunha. Ela precisa de documento com foto.')).toBe(true);
  });
});

describe('processo relacionado (clientes com múltiplos processos)', () => {
  const trabalhista = proc(1001, '1000001-11.2026.5.02.0001', 'Horas extras', '1ª Vara do Trabalho de São Paulo');
  const familia = proc(2002, '1000003-33.2025.8.26.0100', 'Alimentos', '3ª Vara de Família e Sucessões', true);
  it('um processo ativo é o relacionado; vários só com indicação clara; segredo de justiça sem número', () => {
    expect(processoRelacionado([trabalhista], ['tenho uma dúvida'])).toContain('1000001-11.2026.5.02.0001');
    expect(processoRelacionado([trabalhista, familia], ['é sobre a pensão do meu filho'])).toBe('Processo em segredo de justiça (conferir no ProJuris)');
    expect(processoRelacionado([trabalhista, familia], ['sobre a rescisão'])).toContain('1000001');
    expect(processoRelacionado([trabalhista, familia], ['tenho uma dúvida'])).toBe('');
    expect(processoRelacionado([], ['qualquer coisa'])).toBe('');
  });
});

describe('relatório ao advogado: texto, horários e fuso', () => {
  const agora = new Date('2026-11-26T12:00:00Z'); // 09:00 em São Paulo
  const comPendencia = (id: string, nome: string, quando: string, texto: string, extra: Partial<Conversa> = {}) => {
    const c = conversa({ id, mensagens: [msg(`${id}-1`, 'cliente', texto, quando)], ...extra });
    return { id, conversa: registrarEncaminhamento(c, dados(`${id}-1`, texto, { conversaId: id, nomeCliente: nome, processo: id === 'b' ? '' : 'nº 1000001-11.2026.5.02.0001 · TRT-2' }), 'ultramsg', new Date(quando)).conversa };
  };
  it('sem pendências: mensagem exata', () => {
    expect(textoRelatorioAdvogado([], agora, 'Fernando')).toBe('Olá, Fernando! No momento, não há clientes aguardando retorno. ✅');
  });
  it('vários clientes, inclusive de dias anteriores, do mais antigo ao mais recente; respondidos e concluídos fora', () => {
    const a = comPendencia('a', 'Marina Fictícia Souza', '2026-11-26T11:30:00Z', 'Quero falar com a Dra. sobre a audiência');
    const b = comPendencia('b', '', '2026-11-24T19:10:00Z', 'Oi');
    const respondida = comPendencia('c', 'Joana Teste Lima', '2026-11-25T12:00:00Z', 'Dúvida sobre acordo');
    respondida.conversa = { ...respondida.conversa, mensagens: [...respondida.conversa.mensagens, msg('c-2', 'escritorio', 'Joana, o acordo ainda depende da homologação do juiz.', '2026-11-25T13:00:00Z', EQUIPE)] };
    const concluida = comPendencia('d', 'Carlos', '2026-11-25T12:00:00Z', 'Dúvida');
    concluida.conversa = marcarEncaminhamento(concluida.conversa, concluida.conversa.encaminhamentos![0]!.id, 'concluido', 'Fernando').conversa;
    const itens = itensRelatorioAdvogado([a, b, respondida, concluida], 'https://atendimento-legal-desk.lovable.app', agora);
    expect(itens.map(i => i.conversaId)).toEqual(['b', 'a']);
    expect(textoRelatorioAdvogado(itens, agora, 'Fernando')).toBe([
      '📋 ATENDIMENTOS PENDENTES — CS LAWYERS',
      'Olá, Fernando!',
      'Segue a lista atualizada de clientes que aguardam seu retorno.',
      '📅 Data: 26/11/2026',
      '🕐 Horário: 09:00',
      '📌 Total de clientes pendentes: 2',
      '━━━━━━━━━━━━━━━━',
      '👤 Cliente: Nome não identificado',
      '📱 WhatsApp: +55 11 99000-0001',
      '💬 Solicitação: Ainda não informada (o cliente só cumprimentou).',
      '📂 Processo: Não identificado',
      '🕐 Aguardando desde: 24/11/2026 16:10',
      '🔗 Conversa: https://atendimento-legal-desk.lovable.app/atendimento?conversa=b',
      '━━━━━━━━━━━━━━━━',
      '👤 Cliente: Marina Fictícia Souza',
      '📱 WhatsApp: +55 11 99000-0001',
      '💬 Solicitação: Quero falar com a Dra. sobre a audiência',
      '📂 Processo: nº 1000001-11.2026.5.02.0001 · TRT-2',
      '🕐 Aguardando desde: 26/11/2026 08:30',
      '🔗 Conversa: https://atendimento-legal-desk.lovable.app/atendimento?conversa=a',
      '━━━━━━━━━━━━━━━━',
      'Por gentileza, realize o atendimento dos clientes listados acima.',
    ].join('\n'));
  });
  it('disparo às 09h e às 16h no horário de Brasília, com janela de 2 h e nunca fora dela', () => {
    const h = ['09:00', '16:00'];
    expect(horarioRelatorioDevido(h, new Date('2026-11-26T11:59:00Z'))).toBeUndefined(); // 08:59 SP
    expect(horarioRelatorioDevido(h, new Date('2026-11-26T12:00:00Z'))).toEqual({ horario: '09:00', dia: '2026-11-26' });
    expect(horarioRelatorioDevido(h, new Date('2026-11-26T13:59:00Z'))).toEqual({ horario: '09:00', dia: '2026-11-26' });
    expect(horarioRelatorioDevido(h, new Date('2026-11-26T14:00:00Z'))).toBeUndefined(); // 11:00 SP
    expect(horarioRelatorioDevido(h, new Date('2026-11-26T19:00:00Z'))).toEqual({ horario: '16:00', dia: '2026-11-26' });
    expect(horarioRelatorioDevido(h, new Date('2026-11-27T02:30:00Z'))).toBeUndefined(); // 23:30 SP do dia 26
  });
});

describe('configuração central e destinatário exclusivo', () => {
  it('padrão: Fernando, 5511991737442, 09:00 e 16:00; número inválido desliga o envio (nunca outro destino)', () => {
    expect(CONFIG_ENCAMINHAMENTO_PADRAO).toEqual({ ativo: true, responsavel: 'Fernando', whatsapp: '5511991737442', relatorioAtivo: true, horarios: ['09:00', '16:00'] });
    expect(lerConfigSecretaria({}).encaminhamento).toEqual(CONFIG_ENCAMINHAMENTO_PADRAO);
    expect(lerConfigEncaminhamento({ whatsapp: '11991737442' }).whatsapp).toBeNull();
    expect(lerConfigEncaminhamento({ horarios: ['16:00', '09:00', '25:00'] }).horarios).toEqual(['09:00', '16:00']);
    expect(whatsappResponsavelValido('+55 (11) 99173-7442')).toBe('5511991737442');
    expect(whatsappResponsavelValido('551133334444')).toBeNull();
    expect(esquemaConfigSecretaria.shape.encaminhamento.safeParse({ ativo: true, responsavel: 'Fernando', whatsapp: '5511991737442', relatorioAtivo: true, horarios: ['09:00'] }).success).toBe(true);
    expect(esquemaConfigSecretaria.shape.encaminhamento.safeParse({ ativo: true, responsavel: 'Fernando', whatsapp: '120363', relatorioAtivo: true, horarios: ['09:00'] }).success).toBe(false);
  });
  it('envio ao responsável recusa número inválido ou grupo sem chamar o provedor', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await enviarTextoResponsavel('120363000000@g.us', 'x', { ULTRAMSG_INSTANCE_ID: 'i', ULTRAMSG_TOKEN: 't' })).toEqual({ ok: false, erro: 'WhatsApp do responsável inválido.' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ---------- Banco em memória para o relatório (monitor de 5 min, sem navegador) ----------
function bancoFalso(casos: { id: string; owner_id: string; dados: Conversa }[], workspaces: { owner_id: string; dados: unknown }[] = []) {
  const monitor = new Map<string, EstadoRelatorioAdvogado>();
  const auditoria: Record<string, unknown>[] = [];
  const escritasCasos: unknown[] = [];
  const db = {
    from(tabela: string) {
      let op: 'select' | 'insert' | 'update' = 'select'; let valor: { id?: string; estado?: EstadoRelatorioAdvogado } = {}; const filtros: [string, string][] = [];
      const exec = () => {
        if (tabela === 'office_workspace') return { data: workspaces, error: null };
        if (tabela === 'casos') { if (op !== 'select') escritasCasos.push(valor); return { data: casos, error: null }; }
        const id = filtros.find(f => f[0] === 'id')?.[1] ?? '';
        if (op === 'insert') { if (monitor.has(valor.id ?? '')) return { error: { message: 'duplicate key' } }; monitor.set(valor.id ?? '', valor.estado!); return { error: null }; }
        if (op === 'update') {
          const atual = monitor.get(id) as unknown as Record<string, unknown> | undefined;
          if (!atual || !filtros.every(([k, v]) => k === 'id' || !k.startsWith('estado->>') || String(atual[k.slice(9)]) === v)) return { data: [], error: null };
          monitor.set(id, valor.estado!); return { data: [{ id }], error: null };
        }
        return { data: monitor.has(id) ? { estado: monitor.get(id) } : null, error: null };
      };
      const q = { select: () => q, eq: (k: string, v: unknown) => { filtros.push([k, String(v)]); return q; }, not: () => q, insert: (v: typeof valor) => { op = 'insert'; valor = v; return q; }, update: (v: typeof valor) => { op = 'update'; valor = v; return q; },
        maybeSingle: async () => exec(), single: async () => exec(), then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(exec()).then(ok, erro) };
      return q;
    },
    rpc: async (_nome: string, args: Record<string, unknown>) => { auditoria.push(args); return { error: null }; },
  } as unknown as SupabaseClient<Database>;
  return { db, monitor, auditoria, escritasCasos };
}
const casoPendente = (id: string, telefone = TEL) => {
  const c = conversa({ id, telefone, mensagens: [msg(`${id}-1`, 'cliente', 'Preciso falar com a Dra.', '2026-11-26T10:00:00Z')] });
  return { id, owner_id: 'owner', dados: registrarEncaminhamento(c, dados(`${id}-1`, 'Preciso falar com a Dra.', { conversaId: id, telefone }), 'ultramsg', new Date('2026-11-26T10:00:00Z')).conversa };
};
describe('relatório pelo monitor: envio único, novas tentativas, falha ambígua e logs', () => {
  const NOVE = new Date('2026-11-26T12:00:00Z');
  const depois = (min: number) => new Date(NOVE.getTime() + min * 60000);
  it('envia uma única mensagem consolidada ao Fernando às 09h; ciclos seguintes não repetem; não altera as pendências', async () => {
    const b = bancoFalso([casoPendente('a'), casoPendente('b')]);
    const enviar = vi.fn(async (_numero: string, _texto: string) => ({ ok: true, idExterno: 'w1' }));
    expect(await enviarRelatoriosAdvogado(b.db, NOVE, { enviar, base: 'https://app' })).toMatchObject({ enviados: 1, pendentes: 2 });
    await enviarRelatoriosAdvogado(b.db, depois(5), { enviar, base: 'https://app' });
    await enviarRelatoriosAdvogado(b.db, depois(10), { enviar, base: 'https://app' });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]?.[0]).toBe('5511991737442');
    expect(String(enviar.mock.calls[0]?.[1])).toMatch(/^📋 ATENDIMENTOS PENDENTES — CS LAWYERS\nOlá, Fernando!/);
    expect(b.monitor.get(idRelatorio('5511991737442', '2026-11-26', '09:00'))).toMatchObject({ estado: 'enviado', pendentes: 2, tentativas: 1 });
    expect(b.escritasCasos).toEqual([]);
    expect(b.auditoria.some(a => a['p_acao'] === 'relatorioAdvogado' && a['p_status'] === 'sucesso')).toBe(true);
  });
  it('fora do horário não envia; às 16h envia o segundo relatório do dia; sem pendências envia a mensagem de nenhum cliente', async () => {
    const b = bancoFalso([]);
    const enviar = vi.fn(async (_numero: string, _texto: string) => ({ ok: true }));
    expect(await enviarRelatoriosAdvogado(b.db, new Date('2026-11-26T17:00:00Z'), { enviar })).toMatchObject({ devidos: 0 });
    await enviarRelatoriosAdvogado(b.db, new Date('2026-11-26T19:02:00Z'), { enviar });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]?.[1]).toBe('Olá, Fernando! No momento, não há clientes aguardando retorno. ✅');
  });
  it('recusa do provedor: nova tentativa depois de 5 min, até 3; sucesso encerra; nunca duplica', async () => {
    const b = bancoFalso([casoPendente('a')]);
    const enviar = vi.fn().mockResolvedValueOnce({ ok: false, erro: 'UltraMsg recusou o envio (HTTP 500).' }).mockResolvedValueOnce({ ok: true, idExterno: 'w2' });
    await enviarRelatoriosAdvogado(b.db, NOVE, { enviar });
    expect(b.monitor.get(idRelatorio('5511991737442', '2026-11-26', '09:00'))).toMatchObject({ estado: 'falhou', tentativas: 1 });
    await enviarRelatoriosAdvogado(b.db, depois(2), { enviar }); // antes de 5 min: espera
    expect(enviar).toHaveBeenCalledTimes(1);
    await enviarRelatoriosAdvogado(b.db, depois(6), { enviar });
    await enviarRelatoriosAdvogado(b.db, depois(12), { enviar });
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(b.monitor.get(idRelatorio('5511991737442', '2026-11-26', '09:00'))).toMatchObject({ estado: 'enviado', tentativas: 2 });
    expect(b.auditoria.filter(a => a['p_acao'] === 'relatorioAdvogado').map(a => a['p_status'])).toEqual(['erro', 'sucesso']);
  });
  it('falha de comunicação (pode ter saído) vira "incerto" e não é reenviada', async () => {
    const b = bancoFalso([casoPendente('a')]);
    const enviar = vi.fn(async () => ({ ok: false, erro: 'Falha de comunicação com o UltraMsg.', ambiguo: true }));
    await enviarRelatoriosAdvogado(b.db, NOVE, { enviar });
    await enviarRelatoriosAdvogado(b.db, depois(30), { enviar });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(b.monitor.get(idRelatorio('5511991737442', '2026-11-26', '09:00'))?.estado).toBe('incerto');
  });
  it('planos: reserva vencida sem desfecho vira incerto; esgotadas as tentativas, pula', () => {
    expect(planoRelatorio(undefined)).toBe('reservar');
    expect(planoRelatorio({ estado: 'enviando', tentativas: 1, reservadoEm: '', ultimaTentativa: '2026-11-26T12:00:00Z' }, new Date('2026-11-26T12:05:00Z'))).toBe('marcar_incerto');
    expect(planoRelatorio({ estado: 'falhou', tentativas: 3, reservadoEm: '', ultimaTentativa: '2026-11-26T12:00:00Z' }, new Date('2026-11-26T13:00:00Z'))).toBe('pular');
    expect(planoRelatorio({ estado: 'enviado', tentativas: 1, reservadoEm: '', ultimaTentativa: '' })).toBe('pular');
  });
  it('destinatário exclusivo: número de contato de cliente é bloqueado; configuração própria troca o destino', async () => {
    const bloqueio = bancoFalso([casoPendente('a', '5511991737442')]);
    const enviar = vi.fn(async (_numero: string, _texto: string) => ({ ok: true }));
    await enviarRelatoriosAdvogado(bloqueio.db, NOVE, { enviar });
    expect(enviar).not.toHaveBeenCalled();
    expect(bloqueio.monitor.get(idRelatorio('5511991737442', '2026-11-26', '09:00'))?.estado).toBe('bloqueado');
    const proprio = bancoFalso([casoPendente('a')], [{ owner_id: 'owner', dados: { secretaria: { encaminhamento: { responsavel: 'Fernando', whatsapp: '5511988887777', horarios: ['09:00'] } } } }]);
    await enviarRelatoriosAdvogado(proprio.db, NOVE, { enviar });
    expect(enviar.mock.calls.map(c => c[0])).toEqual(['5511988887777', '5511991737442']);
    expect(String(enviar.mock.calls[0]?.[1])).toMatch(/Total de clientes pendentes: 1/);
    expect(enviar.mock.calls[1]?.[1]).toBe('Olá, Fernando! No momento, não há clientes aguardando retorno. ✅');
  });
  it('roda pelo monitor de 5 minutos (servidor, sem navegador): etapa registrada', () => {
    const fonte = readFileSync(path.join(process.cwd(), 'src/lib/atendimento/monitor-operacional.server.ts'), 'utf8');
    expect(fonte).toMatch(/nome: 'relatorio-advogado'[^\n]+enviarRelatoriosAdvogado\(db, agora\)/);
  });
});

// ---------- Fluxo real do servidor (processarAna) ----------
const PROC_TRABALHISTA = proc(1001, '1000001-11.2026.5.02.0001', 'Horas extras', '1ª Vara do Trabalho de São Paulo');
function servidor(extra: Partial<Conversa> = {}, estado: Record<string, unknown> = defaultState as unknown as Record<string, unknown>) {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T13:50:00Z'));
  let saved: Conversa = { ...conversa(), etapa: 'inicial', tipoClienteAgenda: 'novo', modoIA: 'Automática', ...extra };
  let seq = 0;
  mocks.base.mockResolvedValue({ base: undefined });
  mocks.indice.mockResolvedValue({ tipo: 'unico', pessoa: { codigo: 101, nome: 'MARINA FICTÍCIA SOUZA' } });
  mocks.ativos.mockResolvedValue([PROC_TRABALHISTA]);
  mocks.fluxo.mockResolvedValue(false); mocks.enviar.mockResolvedValue({ simulado: false, idExterno: 'enviado' });
  mocks.gerar.mockResolvedValue(resultado('Claro! Vou passar para a equipe.', 'outro'));
  const db = { from(table: string) {
    let patch: { dados: Conversa } | undefined; let update = false;
    const result = () => {
      if (table === 'casos') { if (patch) saved = patch.dados; return { error: null, data: update ? [{ id: saved.id }] : { owner_id: 'owner', dados: saved, updated_at: 'rev' } }; }
      return { error: null, data: table === 'office_workspace' ? { dados: estado } : table === 'checklist_itens' ? [] : table === 'atendimento_canal_config' ? { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true } : { contato_externo: saved.telefone, status: 'liberado' } };
    };
    const query = { select: () => query, eq: () => query, update: (value: { dados: Conversa }) => { patch = value; update = true; return query; }, single: async () => result(), maybeSingle: async () => result(), then: (resolve: (v: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) }; return query;
  }, rpc: async () => ({ error: null }) } as unknown as SupabaseClient<Database>;
  const h = {
    db, get saved() { return saved; }, set saved(v: Conversa) { saved = v; },
    novaMensagem(texto: string) { const id = `ultramsg:${saved.telefone}:${++seq}`; saved = { ...saved, mensagens: [...saved.mensagens, { id, de: 'cliente', canal: 'ultramsg', tipo: 'texto', texto, hora: '', dataHora: new Date().toISOString() }] }; return id; },
    async receber(texto: string) { const id = h.novaMensagem(texto); await processarAna(db, saved.id, id, new Request('http://localhost:8080')); return id; },
    enviados: () => mocks.enviar.mock.calls.map(c => (c[0] as { texto: string }).texto),
    pendencias: () => saved.encaminhamentos ?? [],
  };
  return h;
}
describe('fluxo da Anne no servidor (processarAna)', () => {
  it('cliente ativo com dúvida geral: mensagem fixa exata, pendência completa e a Anne continua ativa', async () => {
    const h = servidor();
    await h.receber('Tenho uma dúvida sobre o meu caso trabalhista');
    expect(h.enviados()).toEqual([mensagemEncaminhamento('Marina')]);
    const p = h.pendencias()[0]!;
    expect(h.pendencias()).toHaveLength(1);
    expect(p).toMatchObject({ responsavel: 'Fernando', status: 'aguardando', telefone: TEL, nomeCliente: 'MARINA FICTÍCIA SOUZA', aviso: { estado: 'enviado' } });
    expect(p.processo).toContain('1000001-11.2026.5.02.0001');
    expect(h.saved.agenteAna?.humano).toBeFalsy();
    expect(h.saved.mensagens.at(-1)?.respostaAnaDe).toBe(h.saved.mensagens.at(-2)?.id);
    expect(mocks.enviar.mock.calls[0]?.[0]).toMatchObject({ motivo: 'ana', mensagemOrigem: h.saved.mensagens.at(-2)?.id });
  });
  it('pedido para falar com a Dra. Carolina: encaminha sem chamar o modelo e sem pausar a Anne', async () => {
    const h = servidor();
    await h.receber('Quero falar com a Dra. Carolina, por favor');
    expect(mocks.gerar).not.toHaveBeenCalled();
    expect(h.enviados()).toEqual([mensagemEncaminhamento('Marina')]);
    expect(h.pendencias()[0]?.motivo).toBe('falar_dra');
    expect(h.saved.agenteAna?.humano).toBeFalsy();
  });
  it('só saudação abre a pendência; a dúvida enviada depois só atualiza (sem repetir a mensagem fixa)', async () => {
    const h = servidor();
    await h.receber('Bom dia');
    await h.receber('Recebi uma carta do fórum, o que significa?');
    expect(h.enviados()).toEqual([mensagemEncaminhamento('Marina')]);
    expect(h.pendencias()).toHaveLength(1);
    expect(resumoSolicitacao(h.pendencias()[0]!, h.saved)).toBe('Recebi uma carta do fórum, o que significa?');
    expect(h.saved.mensagens.at(-1)?.iaExecucao?.estado).toBe('concluida');
  });
  it('mensagens consecutivas: a mensagem nova chega durante o envio e o aviso sai uma única vez, por ela', async () => {
    const h = servidor();
    let novaId = '';
    mocks.enviar.mockImplementationOnce(async () => { novaId = h.novaMensagem('preciso de ajuda com a audiência'); throw Object.assign(new Error('Conversa assumida ou alterada; Ana não enviou.'), { code: 'ana_envio_bloqueado' }); });
    await h.receber('Oi');
    expect(mocks.enviar).toHaveBeenCalledTimes(2);
    expect(mocks.enviar.mock.calls[1]?.[0]).toMatchObject({ mensagemOrigem: novaId });
    await processarAna(h.db, h.saved.id, novaId, new Request('http://localhost:8080'));
    // Duas chamadas ao canal (a primeira barrada antes de sair) e uma única mensagem fixa entregue, pela mensagem nova.
    expect(mocks.enviar).toHaveBeenCalledTimes(2);
    expect(h.saved.mensagens.filter(m => m.respostaAnaDe).map(m => [m.respostaAnaDe, m.texto])).toEqual([[novaId, mensagemEncaminhamento('Marina')]]);
    expect(h.pendencias()).toHaveLength(1);
    expect(h.pendencias()[0]?.aviso.estado).toBe('enviado');
  });
  it('equipe assumiu durante o envio: aviso não sai e a pendência continua na fila', async () => {
    const h = servidor();
    mocks.enviar.mockRejectedValueOnce(Object.assign(new Error('Conversa assumida; Ana não enviou.'), { code: 'ana_envio_bloqueado' }));
    await h.receber('Tenho uma dúvida');
    expect(mocks.enviar).toHaveBeenCalledTimes(1);
    expect(h.pendencias()[0]?.aviso.estado).toBe('nao_enviado');
    expect(encaminhamentoPendente(h.saved)).toBeDefined();
  });
  it('reagendamento e pedido de agenda continuam com a Anne (sem mensagem fixa)', async () => {
    const h = servidor();
    mocks.gerar.mockResolvedValue(resultado('Claro!', 'agendamento'));
    await h.receber('quero marcar uma consulta com a doutora');
    expect(h.enviados().some(t => t.includes('Já iremos retornar'))).toBe(false);
    expect(h.pendencias()).toHaveLength(0);
  });
  it('notícia do processo continua no fluxo revisado', async () => {
    const h = servidor(); mocks.fluxo.mockResolvedValueOnce(true);
    mocks.gerar.mockResolvedValue(resultado('', 'consulta_processo'));
    await h.receber('e o trabalhista, andou alguma coisa?');
    expect(mocks.fluxo).toHaveBeenCalledOnce();
    expect(h.pendencias()).toHaveLength(0);
  });
  it('novo lead não recebe a mensagem do advogado', async () => {
    const h = servidor(); mocks.indice.mockResolvedValue({ tipo: 'nao_encontrado' });
    await h.receber('Olá');
    expect(h.enviados().some(t => t.includes('Já iremos retornar'))).toBe(false);
    expect(h.pendencias()).toHaveLength(0);
  });
  it('falha do ProJuris: sem confirmar cliente ativo não encaminha, e a Anne segue respondendo', async () => {
    const h = servidor({ mensagens: [msg('e1', 'escritorio', 'Olá, aqui é a equipe.', '2026-11-01T12:00:00Z', EQUIPE)] });
    mocks.indice.mockRejectedValue(new Error('ProJuris indisponível'));
    await h.receber('Olá');
    expect(h.pendencias()).toHaveLength(0);
    expect(h.enviados()).toHaveLength(1);
    expect(h.enviados()[0]).not.toMatch(/Já iremos retornar/);
  });
  it('com a IA pausada a mensagem fixa sai mesmo assim (sem modelo)', async () => {
    const h = servidor({}, { ...defaultState, anaPausa: { ativa: true, motivo: 'chave recusada', desde: '2026-11-09T12:00:00Z' } });
    await h.receber('Preciso entender uma cobrança do processo');
    expect(mocks.gerar).not.toHaveBeenCalled();
    expect(h.enviados()).toEqual([mensagemEncaminhamento('Marina')]);
  });
  it('encaminhamento desligado na configuração: fluxo anterior', async () => {
    const h = servidor({}, { ...defaultState, secretaria: { encaminhamento: { ativo: false } } });
    await h.receber('Olá.');
    expect(h.pendencias()).toHaveLength(0);
    expect(h.enviados()[0]).not.toMatch(/Já iremos retornar/);
  });
});
