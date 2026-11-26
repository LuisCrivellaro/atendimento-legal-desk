import { describe, expect, it } from 'vitest';
import { relacionamentoAna, permiteAgendaRelacionamento, protegerRelacionamentoAna } from '@/lib/atendimento/ana-relacionamento';
import { conversas, type Conversa, type Mensagem } from '@/lib/mock-data';
import type { AnaResult } from '@/lib/atendimento/ana-rules';
import { ACOMPANHAMENTO_ANA, SAUDACAO_CONTATO_ANA, perguntaTriagemAna } from '@/lib/atendimento/ana-demanda';

const telefone = '5511990000001';
const identidade = { tipo: 'unico' as const, pessoa: { codigo: 101, nome: 'Cliente Teste' } };
function conversa(extra: Partial<Conversa> = {}): Conversa {
  const base = conversas[0];
  if (!base) throw new Error('Fixture ausente');
  const {contrato: _contrato, ...limpa}=base;
  return { ...limpa, telefone, etapa: 'inicial', processos: [], mensagens: [], timeline: [], agenteAna: {}, ...extra };
}
const comercial: AnaResult = { acao: 'enviar', mensagem: 'Consulta inicial gratuita de 30 minutos. Qual horário prefere?', intencao: 'novo_caso', urgente: false, encaminhar_humano: false, motivo_aprovacao: '', proximo_passo: '', dados_coletados: { nome: '', cpf: '', assunto: '', email: '' } };
const mensagem = (tipo: Mensagem['tipo'], texto = '', arquivo?: string): Mensagem => ({ id: 'm', de: 'cliente', canal: 'ultramsg', hora: '', texto, ...(tipo?{tipo}:{}), ...(arquivo?{arquivo}:{}) });

describe('dez cenários master de reconhecimento', () => {
  it('1 ativo envia vídeo: acompanhamento sem agenda ou associação inventada', () => {
    const c = conversa(); const rel = relacionamentoAna(c, telefone, 'ultramsg', identidade, 1);
    expect(rel).toEqual({ situacao: 'ativo', consultaInicial: false, quantidadeProcessos: 1 });
    expect(permiteAgendaRelacionamento(rel, 'vídeo como prova', c)).toBe(false);
    expect(protegerRelacionamentoAna(comercial, rel, mensagem('video', '', 'prova.mp4'), 'Automática', false).intencao).toBe('documento');
  });
  it('2 fotos e documentos não iniciam captação', () => {
    const rel = relacionamentoAna(conversa(), telefone, 'ultramsg', identidade, 1);
    for (const tipo of ['imagem', 'documento'] as const) expect(protegerRelacionamentoAna(comercial, rel, mensagem(tipo, '', 'arquivo'), 'Automática', false).intencao).toBe('documento');
  });
  it('3 áudio permanece mídia manual, não autorização para agenda', () => {
    const c = conversa(); const rel = relacionamentoAna(c, telefone, 'ultramsg', identidade, 1);
    expect(permiteAgendaRelacionamento(rel, '', c)).toBe(false);
  });
  it('4 pergunta de processo permanece restrita à consulta revisada', () => {
    const rel = relacionamentoAna(conversa(), telefone, 'ultramsg', identidade, 1);
    const r = protegerRelacionamentoAna({ ...comercial, intencao: 'consulta_processo' }, rel, mensagem('texto', 'Como está meu processo?'), 'Automática', false);
    expect(r.acao).toBe('rascunho'); expect(r.mensagem).toBe('');
  });
  it('5 conversa nova após dias não muda vínculo real', () => {
    expect(relacionamentoAna(conversa({ mensagens: [] }), telefone, 'ultramsg', identidade, 1).consultaInicial).toBe(false);
  });
  it('6 informação nova segue contexto em vez de comercial', () => {
    const rel = relacionamentoAna(conversa(), telefone, 'ultramsg', identidade, 1);
    const r = protegerRelacionamentoAna(comercial, rel, mensagem('texto', 'Aconteceu outra coisa'), 'Automática', false);
    expect(r.intencao).toBe('duvida_geral'); expect(r.mensagem).toBe(ACOMPANHAMENTO_ANA); expect(perguntaTriagemAna(r.mensagem)).toBe(false);
  });
  it('7 dois processos não selecionam caso por conta própria', () => {
    const rel = relacionamentoAna(conversa(), telefone, 'ultramsg', identidade, 2);
    const r = protegerRelacionamentoAna(comercial, rel, mensagem('video', '', 'prova'), 'Automática', false);
    expect(rel.quantidadeProcessos).toBe(2); expect(r.intencao).toBe('documento'); expect(r.encaminhar_humano).toBe(false);
  });
  it('8 primeiro contato de lead preserva aquisição', () => {
    const c = conversa(); const rel = relacionamentoAna(c, telefone, 'ultramsg', { tipo: 'nao_encontrado' }, 0);
    expect(rel.consultaInicial).toBe(true); expect(permiteAgendaRelacionamento(rel, 'oi', c)).toBe(true);
    expect(protegerRelacionamentoAna(comercial, rel, mensagem('texto', 'oi'), 'Automática', true)).toBe(comercial);
  });
  it('9 cadastro anterior sem ativo não inicia captação nem pergunta sobre o vínculo (classificação interna)', () => {
    const c = conversa(); const rel = relacionamentoAna(c, telefone, 'ultramsg', identidade, 0);
    expect(rel.situacao).toBe('cadastro_anterior'); expect(rel.consultaInicial).toBe(false); expect(permiteAgendaRelacionamento(rel, 'nova demanda', c)).toBe(false);
    expect(protegerRelacionamentoAna(comercial, rel, mensagem('texto', 'Olá'), 'Automática', false).mensagem).toBe(SAUDACAO_CONTATO_ANA);
  });
  it('10 identificação duvidosa nunca autoriza agenda ou identidade', () => {
    const c = conversa(); const rel = relacionamentoAna(c, telefone, 'ultramsg', { tipo: 'duplicado', codigos: [101, 102] }, 1);
    expect(rel.situacao).toBe('incerto'); expect(rel.quantidadeProcessos).toBe(0); expect(permiteAgendaRelacionamento(rel, 'quero agendar', c)).toBe(false);
  });
  it('contrato enviado e coleta protegem cliente em atendimento mesmo em etapa inicial', () => {
    for (const extra of [{ contrato: 'enviado' as const }, { etapa: 'documentos' as const }]) expect(relacionamentoAna(conversa(extra), telefone, 'ultramsg', { tipo: 'nao_encontrado' }, 0).situacao).toBe('em_atendimento');
  });
  it('cadastro de outro telefone nunca determina vínculo', () => {
    expect(relacionamentoAna(conversa({ telefone: '5511988880000', etapa: 'ativo', contrato: 'assinado' }), telefone, 'ultramsg', { tipo: 'nao_encontrado' }, 0).situacao).toBe('novo_lead');
  });
  it('falha de identificação não pode significar novo lead', () => {
    expect(relacionamentoAna(conversa(), telefone, 'ultramsg').consultaInicial).toBe(false);
  });
  it('consulta marcada e convite comercial antigo não autorizam oferta automática', () => {
    const c = conversa({ consultaAgendada: '2026-11-13T16:30:00Z', agenteAna: { resultado: { ...comercial, intencao: 'agendamento' } } });
    const rel = relacionamentoAna(c, telefone, 'ultramsg', identidade, 1);
    expect(permiteAgendaRelacionamento(rel, 'enviei a prova', c)).toBe(false);
    expect(permiteAgendaRelacionamento(rel, '1', c)).toBe(false);
    expect(permiteAgendaRelacionamento(rel, 'quero remarcar', c)).toBe(true);
  });
  it('ex-cliente confirma nova demanda após esclarecimento e consulta real sem ativos', () => {
    const c = conversa({ mensagens: [{ id: 'a', de: 'escritorio', canal: 'ultramsg', texto: 'Você está retomando um atendimento anterior ou precisa de ajuda com uma nova situação?', hora: '' }, { id: 'b', de: 'cliente', canal: 'ultramsg', texto: 'É uma nova demanda', hora: '' }] });
    expect(relacionamentoAna(c, telefone, 'ultramsg', identidade, 0).consultaInicial).toBe(true);
  });
});