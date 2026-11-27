// Correção definitiva (26/11/2026): a Anne nunca pergunta ao cliente se o assunto é de um atendimento em andamento
// ou uma nova demanda (nem variações). A classificação é interna — cadastro, histórico (inclusive a equipe) e conteúdo.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa, type Mensagem } from '@/lib/mock-data';
import { defaultState } from '@/lib/office';
import { aplicarRegrasAna, SAUDACAO_CLIENTE_NOVO, type AnaResult } from '@/lib/atendimento/ana-rules';
import { relacionamentoAna, permiteAgendaRelacionamento, protegerRelacionamentoAna, type RelacionamentoAna } from '@/lib/atendimento/ana-relacionamento';
import { ACOMPANHAMENTO_ANA, COMO_AJUDAR_ANA, COMO_AJUDAR_CONTEUDO_ANA, CONVITE_ATENDIMENTO_ANA, PEDIDO_ASSUNTO_ANA, SAUDACAO_CONTATO_ANA, apenasSaudacaoAna, demandaNovaRelatada, leituraMensagemAna, perguntaTriagemAna, saudacaoRepetidaAna, semPerguntaTriagemAna } from '@/lib/atendimento/ana-demanda';
import { contextoPersistente } from '@/lib/atendimento/ana-contexto';
import { TEMPLATES_OFICIAIS } from '@/lib/atendimento/biblioteca/mensagens-oficiais';
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

// ---------- A pergunta proibida e variações semânticas ----------
const VARIACOES = [
  'Esse assunto é de um atendimento que já está em andamento conosco ou é uma nova demanda?',
  'Você está retomando um atendimento anterior ou precisa de ajuda com uma nova situação?',
  'Entendi. Esse acontecimento está relacionado ao atendimento que já acompanhamos para você ou é uma situação nova?',
  'É seu primeiro contato ou você já é cliente do escritório?',
  'Você já é cliente?',
  'Você já é nosso cliente?',
  'É um caso novo ou algo que já estamos acompanhando?',
  'Trata-se de um novo assunto ou da continuidade do seu processo?',
  'Isso tem relação com o seu processo atual ou é outra questão?',
  'É sobre o mesmo caso?',
  'Seu atendimento já está em andamento?',
  'É a primeira vez que você fala com a gente?',
  'Você já tem processo com a gente?',
  'Esse assunto é novo ou é continuação do atendimento anterior?',
  'É uma demanda nova ou referente ao processo que já existe?',
  'É uma nova demanda?',
  'Seria algo novo?',
  'Olá! Tudo bem? Esse assunto é de um atendimento em andamento ou é uma nova demanda?',
];
const PERMITIDAS = [
  SAUDACAO_CONTATO_ANA, PEDIDO_ASSUNTO_ANA, COMO_AJUDAR_ANA, COMO_AJUDAR_CONTEUDO_ANA, CONVITE_ATENDIMENTO_ANA, ACOMPANHAMENTO_ANA,
  'Obrigada pelo envio! Esse material está relacionado a qual dos seus atendimentos?',
  'Você já tem uma consulta marcada para quinta, 30/10 às 14h. Deseja remarcar ou cancelar esse agendamento?',
  'Olá! Como posso ajudar com seu atendimento?', 'Quer que a equipe entre em contato com você?',
  'Posso verificar a disponibilidade para um atendimento de acompanhamento com a Dra. Carolina.',
  'Claro! Nossa consulta inicial com a Dra. Carolina é online e gratuita. Posso verificar os horários disponíveis para você?',
  'Prefere algum dia da semana ou período, manhã ou tarde?', 'Qual dos horários enviados fica melhor para você?',
  'Quer marcar um novo horário?', 'Você está em um local seguro agora?', SAUDACAO_CLIENTE_NOVO,
];

describe('detector da pergunta de triagem (todas as variações)', () => {
  it.each(VARIACOES)('reconhece: %s', t => { expect(perguntaTriagemAna(t)).toBe(true); });
  it.each(PERMITIDAS)('não confunde texto permitido: %s', t => { expect(perguntaTriagemAna(t)).toBe(false); });
  it('modelos oficiais da biblioteca não são pergunta de triagem', () => {
    for (const t of Object.values(TEMPLATES_OFICIAIS)) expect(perguntaTriagemAna(t.texto), t.id).toBe(false);
  });
  it('remove a pergunta e mantém o resto; se sobrar só acolhimento, pergunta como ajudar', () => {
    expect(semPerguntaTriagemAna('Entendi, sinto muito pelo ocorrido. Esse assunto é de um atendimento que já está em andamento conosco ou é uma nova demanda?')).toBe('Entendi, sinto muito pelo ocorrido.');
    expect(semPerguntaTriagemAna('Entendi. Esse acontecimento está relacionado ao atendimento que já acompanhamos para você ou é uma situação nova?')).toBe(COMO_AJUDAR_ANA);
    expect(semPerguntaTriagemAna(SAUDACAO_CONTATO_ANA)).toBe(SAUDACAO_CONTATO_ANA);
  });
});

// ---------- Nenhum caminho de código, prompt, fallback ou simulador contém a pergunta ----------
const RAIZ = process.cwd();
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => { const p = path.join(dir, n); return statSync(p).isDirectory() ? arquivos(p) : /\.(?:ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []; });
}
function textosLiterais(arquivo: string): string[] {
  const fonte = ts.createSourceFile(arquivo, readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true, arquivo.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const textos: string[] = [];
  const visitar = (no: ts.Node) => {
    if (ts.isStringLiteralLike(no) || ts.isTemplateHead(no) || ts.isTemplateMiddle(no) || ts.isTemplateTail(no)) textos.push(no.text);
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return textos;
}
describe('varredura: nenhuma origem produz a pergunta', () => {
  it('nenhum texto literal em src/lib e no simulador é pergunta de triagem', () => {
    const lidos = [...arquivos(path.join(RAIZ, 'src/lib')), ...arquivos(path.join(RAIZ, 'tools/simulador-ana'))].map(a => ({ a, textos: textosLiterais(a) }));
    const todos = lidos.flatMap(x => x.textos);
    // A varredura cobre de fato o código da Anne (relacionamento, regras, secretaria, biblioteca e simulador).
    expect(lidos.map(x => path.relative(RAIZ, x.a).replace(/\\/g, '/'))).toEqual(expect.arrayContaining(['src/lib/atendimento/ana-relacionamento.ts', 'src/lib/atendimento/ana-rules.ts', 'src/lib/atendimento/ana.server.ts', 'tools/simulador-ana/engine.ts']));
    expect(todos.length).toBeGreaterThan(2000);
    expect(todos).toContain(SAUDACAO_CONTATO_ANA);
    const achados = lidos.flatMap(({ a, textos }) => textos.filter(perguntaTriagemAna).map(t => `${path.relative(RAIZ, a)}: ${t.slice(0, 90)}`));
    expect(achados).toEqual([]);
  });
  it('prompts da Anne não contêm a pergunta e proíbem transferir a classificação ao cliente', () => {
    for (const nome of ['ana-prompt.txt', 'ana-restrictions.txt']) {
      const texto = readFileSync(path.join(RAIZ, 'src/lib/atendimento', nome), 'utf8');
      expect(perguntaTriagemAna(texto), nome).toBe(false);
      expect(texto, nome).not.toMatch(/esclarecer se retoma atendimento|v[ií]nculo a esclarecer/i);
      expect(texto, nome).toMatch(/Nunca transfira essa decisão ao cliente/);
    }
  });
});

// ---------- Leitura interna da mensagem ----------
describe('leitura interna da mensagem (sem perguntar ao cliente)', () => {
  it.each([
    ['Olá.', 'saudacao'], ['Oi, tudo bem?', 'saudacao'], ['Boa tarde, Dra. Carolina!', 'saudacao'], ['oii', 'saudacao'],
    ['Gostaria de falar sobre outro assunto.', 'outro_assunto'], ['É outro assunto', 'outro_assunto'],
    ['Fui demitido e não recebi a rescisão', 'nova_demanda'], ['quero marcar uma consulta', 'nova_demanda'], ['Preciso de ajuda com uma questão de pensão alimentícia', 'nova_demanda'],
    ['preciso de ajuda', 'indefinida'], ['Bom dia, tenho uma dúvida', 'indefinida'],
    ['Aconteceu outra coisa', 'conteudo'], ['Gostaria de saber como está meu processo.', 'conteudo'],
  ] as const)('%s → %s', (texto, esperado) => { expect(leituraMensagemAna(texto)).toBe(esperado); });
  it('saudação não é nova demanda', () => { expect(apenasSaudacaoAna('Olá! Bom dia!')).toBe(true); expect(apenasSaudacaoAna('Bom dia. É o Paulo.')).toBe(false); });
});

// ---------- Estados de relacionamento × mensagens × respostas do modelo ----------
const telefone = '5511990000001';
const base = conversas[0];
if (!base) throw new Error('Fixture ausente');
const { contrato: _contrato, ...limpa } = base;
const conversa = (extra: Partial<Conversa> = {}): Conversa => ({ ...limpa, telefone, etapa: 'inicial', processos: [], mensagens: [], timeline: [], agenteAna: {}, ...extra });
const msg = (id: string, de: Mensagem['de'], texto: string, extra: Partial<Mensagem> = {}): Mensagem => ({ id, de, texto, canal: 'ultramsg', hora: '', ...extra });
const ANNE = { autor: 'Ana · assistente virtual' };
const EQUIPE = { autor: 'Equipe · celular do escritório' };
const resultado = (mensagem: string, intencao: AnaResult['intencao'] = 'duvida_geral'): AnaResult => ({ acao: 'enviar', mensagem, intencao, urgente: false, encaminhar_humano: false, motivo_aprovacao: '', proximo_passo: '', dados_coletados: { nome: '', cpf: '', assunto: '', email: '' } });
const unico = { tipo: 'unico' as const, pessoa: { codigo: 101, nome: 'Cliente Teste' } };
const ESTADOS: [string, RelacionamentoAna][] = [
  ['ativo', { situacao: 'ativo', consultaInicial: false, quantidadeProcessos: 1 }],
  ['ativo com 2 processos', { situacao: 'ativo', consultaInicial: false, quantidadeProcessos: 2 }],
  ['em atendimento', { situacao: 'em_atendimento', consultaInicial: false, quantidadeProcessos: 0 }],
  ['cadastro anterior', { situacao: 'cadastro_anterior', consultaInicial: false, quantidadeProcessos: 0 }],
  ['incerto', { situacao: 'incerto', consultaInicial: false, quantidadeProcessos: 0 }],
  ['novo lead', { situacao: 'novo_lead', consultaInicial: true, quantidadeProcessos: 0 }],
];
const MENSAGENS: Mensagem[] = [
  msg('m', 'cliente', 'Olá.'), msg('m', 'cliente', 'Oi, tudo bem?'), msg('m', 'cliente', 'Gostaria de falar sobre outro assunto.'),
  msg('m', 'cliente', 'Gostaria de saber como está meu processo.'), msg('m', 'cliente', 'Fui demitido e não recebi nada'),
  msg('m', 'cliente', 'quero marcar uma consulta'), msg('m', 'cliente', 'Aconteceu outra coisa'), msg('m', 'cliente', 'preciso de ajuda'),
  msg('m', 'cliente', 'É uma nova demanda'), msg('m', 'cliente', '', { arquivo: 'prova.pdf', tipo: 'documento' }),
];
const RESPOSTAS_MODELO = [
  resultado('Consulta inicial gratuita de 30 minutos. Qual horário prefere?', 'novo_caso'),
  resultado('Esse assunto é de um atendimento que já está em andamento conosco ou é uma nova demanda?'),
  resultado('Você está retomando um atendimento anterior ou precisa de ajuda com uma nova situação?', 'novo_caso'),
  resultado('É seu primeiro contato ou você já é cliente do escritório?', 'agendamento'),
  resultado('Claro! Me conta como posso te ajudar.'),
];
describe('matriz: nenhum estado, mensagem ou resposta do modelo leva a pergunta ao cliente', () => {
  for (const [nome, rel] of ESTADOS) for (const modo of ['Automática', 'Sugerir'] as const) it(`${nome} · ${modo}`, () => {
    for (const m of MENSAGENS) for (const gerada of RESPOSTAS_MODELO) {
      const c = conversa({ mensagens: [m] });
      const regras = aplicarRegrasAna(gerada, modo, m.texto, [], { consultaInicial: rel.consultaInicial, tipoCliente: rel.consultaInicial ? 'novo' : 'cadastrado', nome: 'Cliente Teste', telefone });
      const final = protegerRelacionamentoAna(regras, rel, m, modo, permiteAgendaRelacionamento(rel, m.texto, c), c);
      expect(perguntaTriagemAna(final.mensagem), `${nome} · "${m.texto || m.arquivo}" · modelo "${gerada.mensagem.slice(0, 40)}" → "${final.mensagem}"`).toBe(false);
    }
  });
  it('contato conhecido que só cumprimenta recebe "Olá! Tudo bem? Como posso te ajudar?"', () => {
    for (const [, rel] of ESTADOS.filter(([, r]) => !r.consultaInicial)) {
      const r = protegerRelacionamentoAna(resultado('Consulta inicial gratuita de 30 minutos.', 'novo_caso'), rel, msg('m', 'cliente', 'Olá.'), 'Automática', false, conversa());
      expect(r.mensagem).toBe(SAUDACAO_CONTATO_ANA); expect(r.acao).toBe('enviar'); expect(r.encaminhar_humano).toBe(false);
    }
  });
  it('"outro assunto" pede o relato; intenção não identificada pergunta como ajudar', () => {
    const rel = ESTADOS[3]![1];
    expect(protegerRelacionamentoAna(resultado('Posso verificar horário?', 'novo_caso'), rel, msg('m', 'cliente', 'Gostaria de falar sobre outro assunto.'), 'Automática', false).mensagem).toBe(PEDIDO_ASSUNTO_ANA);
    expect(protegerRelacionamentoAna(resultado('Consulta gratuita?', 'novo_caso'), rel, msg('m', 'cliente', 'preciso de ajuda'), 'Automática', false).mensagem).toBe(COMO_AJUDAR_ANA);
  });
  it('cliente da casa com nova demanda recebe convite; com acontecimento, continua o atendimento existente', () => {
    const rel = ESTADOS[0]![1];
    const comercial = resultado('Consulta inicial gratuita de 30 minutos.', 'novo_caso');
    expect(protegerRelacionamentoAna(comercial, rel, msg('m', 'cliente', 'Quero entrar com um pedido de divórcio'), 'Automática', false).mensagem).toBe(CONVITE_ATENDIMENTO_ANA);
    expect(protegerRelacionamentoAna(comercial, rel, msg('m', 'cliente', 'Aconteceu outra coisa'), 'Automática', false).mensagem).toBe(ACOMPANHAMENTO_ANA);
  });
  it('vínculo em conferência com nova demanda vai para a equipe, sem perguntar nada ao cliente', () => {
    const r = protegerRelacionamentoAna(resultado('Posso verificar horários?', 'agendamento'), ESTADOS[4]![1], msg('m', 'cliente', 'quero marcar uma consulta'), 'Automática', false);
    expect(r.encaminhar_humano).toBe(true); expect(r.mensagem).toBe('Sua solicitação fica com a equipe responsável pelo atendimento, que responde por aqui.');
  });
  it('vários atendimentos: material pergunta só qual dos atendimentos (sem triagem)', () => {
    const r = protegerRelacionamentoAna(resultado('Recebi.'), ESTADOS[1]![1], msg('m', 'cliente', '', { arquivo: 'foto.jpg', tipo: 'imagem' }), 'Automática', false);
    expect(r.mensagem).toBe('Obrigada pelo envio! Esse material está relacionado a qual dos seus atendimentos?'); expect(r.intencao).toBe('documento');
  });
  it('pedido de notícia do processo segue só a consulta revisada', () => {
    const r = protegerRelacionamentoAna(resultado('Seu processo está andando.'), ESTADOS[0]![1], msg('m', 'cliente', 'Gostaria de saber como está meu processo.'), 'Automática', false);
    expect(r.acao).toBe('rascunho'); expect(r.mensagem).toBe('');
  });
});

// ---------- Classificação interna pelo histórico ----------
describe('relacionamento resolvido internamente (cadastro, histórico e conteúdo)', () => {
  it('ex-cliente sem processo ativo: saudação mantém o contato conhecido; relato de problema já é nova demanda', () => {
    expect(relacionamentoAna(conversa({ mensagens: [msg('a', 'cliente', 'Olá.')] }), telefone, 'ultramsg', unico, 0).situacao).toBe('cadastro_anterior');
    expect(relacionamentoAna(conversa({ mensagens: [msg('a', 'cliente', 'Olá.'), msg('b', 'escritorio', SAUDACAO_CONTATO_ANA, { ...ANNE, respostaAnaDe: 'a' }), msg('c', 'cliente', 'Fui demitido e não recebi a rescisão')] }), telefone, 'ultramsg', unico, 0).situacao).toBe('novo_lead');
  });
  it('fala da equipe depois do relato devolve a decisão à equipe', () => {
    const c = conversa({ mensagens: [msg('a', 'cliente', 'Fui demitido'), msg('b', 'escritorio', 'Vou verificar com a Dra. e te retorno.', EQUIPE), msg('c', 'cliente', 'ok, obrigado')] });
    expect(relacionamentoAna(c, telefone, 'ultramsg', unico, 0).situacao).toBe('cadastro_anterior');
  });
  it('relato antigo (mais de 30 dias) não reclassifica uma conversa retomada', () => {
    const c = conversa({ mensagens: [msg('a', 'cliente', 'Fui demitido', { dataHora: '2026-06-01T12:00:00Z' }), msg('b', 'cliente', 'Olá', { dataHora: '2026-11-20T12:00:00Z' })] });
    expect(relacionamentoAna(c, telefone, 'ultramsg', unico, 0).situacao).toBe('cadastro_anterior');
  });
  it('vínculo em conferência: só pedido de consulta ou "outro assunto" com relato vira lead', () => {
    expect(relacionamentoAna(conversa({ mensagens: [msg('a', 'cliente', 'Fui demitido')] }), telefone, 'ultramsg').situacao).toBe('incerto');
    expect(relacionamentoAna(conversa({ mensagens: [msg('a', 'cliente', 'quero marcar uma consulta')] }), telefone, 'ultramsg').situacao).toBe('novo_lead');
    const relatado = conversa({ mensagens: [msg('a', 'cliente', 'Gostaria de falar sobre outro assunto.'), msg('b', 'escritorio', PEDIDO_ASSUNTO_ANA, { ...ANNE, respostaAnaDe: 'a' }), msg('c', 'cliente', 'Minha vizinha construiu um muro no meu terreno')] });
    expect(demandaNovaRelatada(relatado.mensagens)).toEqual({ relato: true, forte: true });
    expect(relacionamentoAna(relatado, telefone, 'ultramsg').situacao).toBe('novo_lead');
  });
  it('telefone em dois cadastros nunca é classificado pelo conteúdo: a equipe confirma', () => {
    expect(relacionamentoAna(conversa({ mensagens: [msg('a', 'cliente', 'quero marcar uma consulta')] }), telefone, 'ultramsg', { tipo: 'duplicado', codigos: [101, 102] }, 0).situacao).toBe('incerto');
  });
  it('pessoa da equipe chamada "Ana Paula" é equipe, não a Anne', () => {
    const c = conversa({ mensagens: [msg('a', 'cliente', 'oi'), msg('b', 'escritorio', `${SAUDACAO_CLIENTE_NOVO}\nTemos horários hoje`, { ...ANNE, respostaAnaDe: 'a' }), msg('c', 'escritorio', 'Oi, aqui é a Ana Paula, do escritório.', { autor: 'Ana Paula' }), msg('d', 'cliente', 'ok')] });
    expect(relacionamentoAna(c, telefone, 'ultramsg').situacao).toBe('incerto');
  });
  it('histórico enviado ao modelo diferencia cliente, equipe, Anne e automação', () => {
    const c = conversa({ mensagens: [msg('a', 'cliente', 'oi'), msg('b', 'escritorio', SAUDACAO_CONTATO_ANA, { ...ANNE, respostaAnaDe: 'a' }), msg('c', 'escritorio', 'Segue o contrato.', EQUIPE), msg('d', 'escritorio', 'Lembrete da consulta', { ...ANNE, automacaoKey: 'lembrete' }), msg('e', 'sistema', 'interno')] });
    expect(contextoPersistente(c, 'ultramsg').historico.map(h => h.origem)).toEqual(['cliente', 'anne', 'equipe', 'automacao']);
  });
  it('histórico incompleto (sem datas, apagadas, outro canal, outro telefone) não gera pergunta nem erro', () => {
    const c = conversa({ mensagens: [msg('a', 'cliente', 'Fui demitido', { apagadaParaTodos: { em: '2026-11-20T12:00:00Z', por: 'cliente' } }), msg('b', 'cliente', 'Olá', { canal: 'telegram' }), msg('c', 'cliente', 'Olá')] });
    expect(relacionamentoAna(c, telefone, 'ultramsg', unico, 0).situacao).toBe('cadastro_anterior');
    expect(relacionamentoAna(conversa({ telefone: '5511988887777', mensagens: [msg('a', 'cliente', 'quero marcar uma consulta')] }), telefone, 'ultramsg').situacao).toBe('incerto');
  });
});

// ---------- Mensagens consecutivas ----------
describe('saudações consecutivas: uma resposta só', () => {
  const hora = (h: string) => ({ dataHora: `2026-11-26T${h}:00-03:00` });
  it('segunda saudação depois da resposta da Anne não recebe outra resposta', () => {
    const c = conversa({ mensagens: [msg('a', 'cliente', 'Olá', hora('10:00')), msg('b', 'escritorio', SAUDACAO_CONTATO_ANA, { ...ANNE, respostaAnaDe: 'a', ...hora('10:00') }), msg('c', 'cliente', 'Oi, tudo bem?', hora('10:01'))] });
    expect(saudacaoRepetidaAna(c, 'c', 'ultramsg')).toBe(true);
  });
  it('sem resposta à primeira, após um assunto, em outra sessão ou com anexo, responde normalmente', () => {
    expect(saudacaoRepetidaAna(conversa({ mensagens: [msg('a', 'cliente', 'Olá', hora('10:00')), msg('c', 'cliente', 'Oi', hora('10:01'))] }), 'c', 'ultramsg')).toBe(false);
    expect(saudacaoRepetidaAna(conversa({ mensagens: [msg('a', 'cliente', 'Fui demitido', hora('10:00')), msg('b', 'escritorio', 'Entendi.', { ...ANNE, ...hora('10:00') }), msg('c', 'cliente', 'Oi', hora('10:01'))] }), 'c', 'ultramsg')).toBe(false);
    expect(saudacaoRepetidaAna(conversa({ mensagens: [msg('a', 'cliente', 'Olá', hora('08:00')), msg('b', 'escritorio', SAUDACAO_CONTATO_ANA, { ...ANNE, ...hora('08:00') }), msg('c', 'cliente', 'Oi', hora('13:00'))] }), 'c', 'ultramsg')).toBe(false);
    expect(saudacaoRepetidaAna(conversa({ mensagens: [msg('a', 'cliente', 'Olá', hora('10:00')), msg('b', 'escritorio', SAUDACAO_CONTATO_ANA, { ...ANNE, ...hora('10:00') }), msg('c', 'cliente', 'Oi', { arquivo: 'x.jpg', ...hora('10:01') })] }), 'c', 'ultramsg')).toBe(false);
  });
});

// ---------- Fluxo real do servidor (processarAna) com integrações substituídas ----------
// Cliente ativo vai para o advogado (encaminhamento-advogado.test.ts); aqui o encaminhamento fica desligado para
// cobrir as respostas internas de reserva (contato conhecido sem a pergunta de triagem).
const ESTADO_SEM_ADVOGADO = { ...defaultState, secretaria: { encaminhamento: { ativo: false } } };
function servidor(extra: Partial<Conversa> = {}, opcoes: { semCarteira?: boolean } = {}) {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T12:50:00Z'));
  let saved: Conversa = { ...limpa, telefone, etapa: 'inicial', processos: [], consultaAgendada: undefined, tipoClienteAgenda: 'novo', modoIA: 'Automática', mensagens: [], timeline: [], agenteAna: {}, ...extra };
  if (opcoes.semCarteira) delete saved.tipoClienteAgenda;
  let seq = 0;
  mocks.base.mockResolvedValue({ base: undefined });
  mocks.indice.mockResolvedValue(unico);
  mocks.ativos.mockResolvedValue([{ codigo: 1001 }]);
  mocks.fluxo.mockResolvedValue(false); mocks.enviar.mockResolvedValue({ simulado: false, idExterno: 'enviado' });
  mocks.gerar.mockResolvedValue(resultado('Recebi. Consulta inicial gratuita de 30 minutos. Qual dos horários prefere?', 'novo_caso'));
  const db = { from(table: string) {
    let patch: { dados: Conversa } | undefined; let update = false;
    const result = () => {
      if (table === 'casos') { if (patch) saved = patch.dados; return { error: null, data: update ? [{ id: saved.id }] : { owner_id: 'owner', dados: saved, updated_at: 'rev' } }; }
      return { error: null, data: table === 'office_workspace' ? { dados: ESTADO_SEM_ADVOGADO } : table === 'checklist_itens' ? [] : table === 'atendimento_canal_config' ? { agente_ativo: true, canal_ativo: 'ultramsg', modo_teste: true } : { contato_externo: saved.telefone, status: 'liberado' } };
    };
    const query = { select: () => query, eq: () => query, update: (value: { dados: Conversa }) => { patch = value; update = true; return query; }, single: async () => result(), maybeSingle: async () => result(), then: (resolve: (v: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) }; return query;
  }, rpc: async () => ({ error: null }) } as unknown as SupabaseClient<Database>;
  return {
    db, get saved() { return saved; },
    async receber(texto: string, extraMsg: Partial<Mensagem> = {}) {
      const id = `ultramsg:${saved.telefone}:${++seq}`;
      saved = { ...saved, mensagens: [...saved.mensagens, { id, de: 'cliente', canal: 'ultramsg', tipo: 'texto', texto, hora: '', dataHora: new Date().toISOString(), ...extraMsg }] };
      await processarAna(db, saved.id, id, new Request('http://localhost:8080'));
      return id;
    },
    enviados: () => mocks.enviar.mock.calls.map(c => (c[0] as { texto: string }).texto),
  };
}
describe('fluxo do servidor: cenários obrigatórios sem a pergunta proibida', () => {
  it('cliente existente: "Olá." → cumprimento e como ajudar', async () => {
    const h = servidor(); await h.receber('Olá.');
    expect(h.enviados()).toEqual([SAUDACAO_CONTATO_ANA]);
  });
  it('cliente existente: "Gostaria de saber como está meu processo." vai à consulta revisada, sem perguntar nada', async () => {
    const h = servidor(); mocks.fluxo.mockResolvedValueOnce(true);
    await h.receber('Gostaria de saber como está meu processo.');
    expect(mocks.fluxo).toHaveBeenCalledWith(h.db, expect.objectContaining({ telefone, texto: 'Gostaria de saber como está meu processo.' }));
    expect(h.enviados()).toEqual([]);
  });
  it('cliente existente: "Gostaria de falar sobre outro assunto." → pede o relato; o relato vira convite; "sim" traz horários de sexta', async () => {
    const h = servidor();
    await h.receber('Gostaria de falar sobre outro assunto.');
    await h.receber('Quero entrar com um pedido de divórcio');
    mocks.gerar.mockResolvedValueOnce(resultado('Claro!', 'outro'));
    await h.receber('sim');
    const enviados = h.enviados();
    expect(enviados.slice(0, 2)).toEqual([PEDIDO_ASSUNTO_ANA, CONVITE_ATENDIMENTO_ANA]);
    expect(enviados[2]).toMatch(/^Tenho estes horários livres/);
    const ofertados = h.saved.agenteAna?.horariosTeste ?? [];
    expect(ofertados.length).toBeGreaterThan(0);
    expect(ofertados.every(s => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date(s)) === 'Fri')).toBe(true);
    expect(enviados.some(perguntaTriagemAna)).toBe(false);
  });
  it('novo lead: "Olá." recebe a saudação oficial com horários (fluxo de captação preservado)', async () => {
    const h = servidor(); mocks.indice.mockResolvedValue({ tipo: 'nao_encontrado' });
    await h.receber('Olá.');
    expect(h.enviados()).toHaveLength(1);
    expect(h.enviados()[0]).toMatch(/Seja bem vind|primeira consulta/i);
    expect(perguntaTriagemAna(h.enviados()[0]!)).toBe(false);
  });
  it('ex-cliente sem processo ativo: saudação é respondida; relato de problema segue como nova demanda', async () => {
    const h = servidor(); mocks.ativos.mockResolvedValue([]);
    await h.receber('Olá.');
    mocks.gerar.mockResolvedValueOnce(resultado('Sinto muito. Quem avalia é a Dra. Carolina, numa consulta online e gratuita. Quer que eu marque?', 'novo_caso'));
    await h.receber('Fui demitido e não recebi a rescisão');
    expect(h.enviados()[0]).toBe(SAUDACAO_CONTATO_ANA);
    expect(mocks.gerar.mock.calls.at(-1)?.[1].relacionamento.consultaInicial).toBe(true);
    expect(h.enviados()[1]).toMatch(/consulta online e gratuita/);
    expect(h.saved.agenteAna?.humano).toBeFalsy();
  });
  it('telefone em dois cadastros e falha do ProJuris com histórico da equipe: cumprimento, nunca a pergunta', async () => {
    const dup = servidor(); mocks.indice.mockResolvedValue({ tipo: 'duplicado', codigos: [101, 102] });
    await dup.receber('Bom dia');
    expect(dup.enviados()).toEqual([SAUDACAO_CONTATO_ANA]);
    const falha = servidor({ mensagens: [msg('e1', 'escritorio', 'Olá, aqui é a equipe do escritório.', { ...EQUIPE, dataHora: '2026-11-01T12:00:00Z' })] });
    mocks.indice.mockRejectedValue(new Error('Indisponível'));
    await falha.receber('Olá');
    expect(falha.enviados()).toEqual([SAUDACAO_CONTATO_ANA]);
  });
  it('duas saudações seguidas: uma resposta só e o modelo não é chamado de novo', async () => {
    const h = servidor();
    await h.receber('Olá'); await h.receber('Oi, tudo bem?');
    expect(h.enviados()).toEqual([SAUDACAO_CONTATO_ANA]);
    expect(mocks.gerar).toHaveBeenCalledTimes(1);
    expect(h.saved.mensagens.at(-1)?.iaExecucao?.estado).toBe('concluida');
  });
  it('conversa assumida pela equipe: Anne em silêncio; devolvida, considera a fala da equipe no histórico', async () => {
    const assumida = servidor({ agenteAna: { humano: true } });
    await assumida.receber('Olá');
    expect(assumida.enviados()).toEqual([]);
    const devolvida = servidor({ mensagens: [msg('e1', 'escritorio', 'Oi! Aqui é a equipe; seu contrato já foi enviado.', { ...EQUIPE, dataHora: '2026-11-08T12:00:00Z' })] });
    await devolvida.receber('Olá');
    expect(devolvida.enviados()).toEqual([SAUDACAO_CONTATO_ANA]);
    expect(mocks.gerar.mock.calls[0]?.[1].historico.find((x: { id: string }) => x.id === 'e1')?.origem).toBe('equipe');
  });
  it('contato com múltiplas demandas (processo + novo assunto) usa a consulta revisada e nunca a pergunta', async () => {
    const h = servidor(); mocks.fluxo.mockResolvedValueOnce(true);
    await h.receber('Queria saber como está meu processo e também preciso de ajuda com um divórcio');
    expect(mocks.fluxo).toHaveBeenCalledOnce();
    expect(h.enviados().some(perguntaTriagemAna)).toBe(false);
  });
  it('contexto ao modelo nunca manda perguntar a carteira ao cliente', async () => {
    const h = servidor({}, { semCarteira: true }); mocks.indice.mockResolvedValue({ tipo: 'duplicado', codigos: [101, 102] });
    await h.receber('Bom dia, tudo bem?');
    expect(mocks.gerar.mock.calls[0]?.[1].tipo_cliente_agenda).toBe('em conferência pela equipe; não perguntar ao cliente');
    expect(h.enviados()).toEqual([SAUDACAO_CONTATO_ANA]);
  });
});
