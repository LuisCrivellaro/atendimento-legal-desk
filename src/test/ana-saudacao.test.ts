import { describe, it, expect } from 'vitest';
import { SAUDACAO_CLIENTE_NOVO, apenasCumprimentoAna, saudacaoClienteNovo, type AnaResult } from '@/lib/atendimento/ana-rules';
import { listaHorariosAna, selecionarOpcoesAna } from '@/lib/atendimento/ana-scheduling';

const r = (extra: Partial<AnaResult> = {}): AnaResult => ({ acao: 'enviar', mensagem: 'texto do modelo', motivo_aprovacao: '', intencao: 'duvida_geral', urgente: false, encaminhar_humano: false, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '', ...extra });

describe('Saudação oficial do cliente novo (03/11/2026)', () => {
  it('texto exato definido pela Dra.', () => {
    expect(saudacaoClienteNovo(r(), 'oi', {apresentado:false,agendaReal:false,horarios:[]} ).acao).toBe('rascunho');
  });
  it('reconhece só cumprimentos, com ou sem pontuação e emoji', () => {
    for (const t of ['oi', 'Olá!', 'boa tarde', 'Oi, boa noite! tudo bem?', 'bom dia 😊', 'opa', 'e aí']) expect(apenasCumprimentoAna(t), t).toBe(true);
    for (const t of ['oi, quero agendar', 'boa tarde, preciso de ajuda com um processo', 'ok', '', '??']) expect(apenasCumprimentoAna(t), t).toBe(false);
  });
  it('cliente novo que só cumprimenta recebe a saudação exata', () => {
    expect(saudacaoClienteNovo(r(), 'boa tarde', { apresentado: false, tipoCliente: undefined,agendaReal:true,horarios:['2026-11-09T12:00:00Z'] }).mensagem).toContain(SAUDACAO_CLIENTE_NOVO);
    expect(saudacaoClienteNovo(r(), 'oi', { apresentado: false, tipoCliente: 'novo',agendaReal:true,horarios:['2026-11-09T12:00:00Z'] }).mensagem).toContain(SAUDACAO_CLIENTE_NOVO);
  });
  it('primeira mensagem com pedido também recebe só a saudação, como agendamento', () => {
    const x = saudacaoClienteNovo(r(), 'oi, quero agendar uma consulta', { apresentado: false,agendaReal:true,horarios:['2026-11-09T12:00:00Z'] });
    expect(x.mensagem).toContain(SAUDACAO_CLIENTE_NOVO);
    expect(x.intencao).toBe('agendamento');
  });
  it('não troca: já apresentado, cliente cadastrado, passagem para a equipe ou rascunho', () => {
    expect(saudacaoClienteNovo(r(), 'oi', { apresentado: true }).mensagem).toBe('texto do modelo');
    expect(saudacaoClienteNovo(r(), 'oi', { apresentado: false, tipoCliente: 'cadastrado' }).mensagem).toBe('texto do modelo');
    expect(saudacaoClienteNovo(r({ encaminhar_humano: true }), 'oi', { apresentado: false }).mensagem).toBe('texto do modelo');
    expect(saudacaoClienteNovo(r({ acao: 'rascunho' }), 'oi', { apresentado: false }).mensagem).toBe('texto do modelo');
  });
});

describe('Lista de horários do fluxo oficial (03/11/2026)', () => {
  const agora = new Date('2026-11-06T12:00:00-03:00');
  const slots = ['2026-11-09T09:00:00-03:00', '2026-11-10T13:00:00-03:00', '2026-11-11T09:30:00-03:00'];
  const esperado = 'Tenho estes horários livres na agenda:\n1. Segunda-feira, 09/11, às 9h\n2. Terça-feira, 10/11, às 13h\n3. Quarta-feira, 11/11, às 9h30\nPara escolher um horário, responda com o número da opção desejada.';
  it('primeira lista no modelo exato', () => { expect(listaHorariosAna(slots, agora)).toBe(esperado); });
  it('novas opções no mesmo formato', () => { expect(listaHorariosAna(slots, agora, true)).toBe(esperado); });
});

describe('Prioridade cronológica da primeira oferta',()=>{
 it('oferece 2 horários: a tarde mais próxima e a manhã mais próxima, ignorando bloqueio',()=>{
 const now=new Date('2026-11-03T17:55:00Z');
 const x=selecionarOpcoesAna([{start:'2026-11-03T18:00:00Z',end:'2026-11-03T18:30:00Z'}],now,'novo');
 expect(x.slots.map(s=>new Date(s).toISOString()).slice(0,2)).toEqual(['2026-11-03T18:30:00.000Z','2026-11-04T12:00:00.000Z']);expect(x.slots).toHaveLength(3);
 });
});
