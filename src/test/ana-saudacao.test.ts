import { describe, it, expect } from 'vitest';
import { SAUDACAO_CLIENTE_NOVO, apenasCumprimentoAna, saudacaoClienteNovo, type AnaResult } from '@/lib/atendimento/ana-rules';
import { listaHorariosAna } from '@/lib/atendimento/ana-scheduling';

const r = (extra: Partial<AnaResult> = {}): AnaResult => ({ acao: 'enviar', mensagem: 'texto do modelo', motivo_aprovacao: '', intencao: 'duvida_geral', urgente: false, encaminhar_humano: false, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '', ...extra });

describe('Saudação oficial do cliente novo (03/11/2026)', () => {
  it('texto exato definido pela Dra.', () => {
    expect(SAUDACAO_CLIENTE_NOVO).toBe('Olá,\n\nSeja bem vindo (a)😊\n\nEquipe CS Advocacia\nwww.carolinasantos.com.br\n\nVou te ajudar!\nNossa primeira consulta é on-line e gratuita.\n\nQual o seu nome?');
  });
  it('reconhece só cumprimentos, com ou sem pontuação e emoji', () => {
    for (const t of ['oi', 'Olá!', 'boa tarde', 'Oi, boa noite! tudo bem?', 'bom dia 😊', 'opa', 'e aí']) expect(apenasCumprimentoAna(t), t).toBe(true);
    for (const t of ['oi, quero agendar', 'boa tarde, preciso de ajuda com um processo', 'ok', '', '??']) expect(apenasCumprimentoAna(t), t).toBe(false);
  });
  it('cliente novo que só cumprimenta recebe a saudação exata', () => {
    expect(saudacaoClienteNovo(r(), 'boa tarde', { apresentado: false, tipoCliente: undefined }).mensagem).toBe(SAUDACAO_CLIENTE_NOVO);
    expect(saudacaoClienteNovo(r(), 'oi', { apresentado: false, tipoCliente: 'novo' }).mensagem).toBe(SAUDACAO_CLIENTE_NOVO);
  });
  it('primeira mensagem com pedido também recebe só a saudação, como agendamento', () => {
    const x = saudacaoClienteNovo(r(), 'oi, quero agendar uma consulta', { apresentado: false });
    expect(x.mensagem).toBe(SAUDACAO_CLIENTE_NOVO);
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
  const esperado = 'Tenho estes horários livres na agenda:\n\n• Segunda-feira, 09/11, às 9h\n• Terça-feira, 10/11, às 13h\n• Quarta-feira, 11/11, às 9h30\n\nQual prefere?\n\n1. Segunda-feira, 09/11, às 9h\n2. Terça-feira, 10/11, às 13h\n3. Quarta-feira, 11/11, às 9h30\n\nResponda com o número do horário escolhido.';
  it('primeira lista no modelo exato', () => { expect(listaHorariosAna(slots, agora)).toBe(esperado); });
  it('novas opções no mesmo formato', () => { expect(listaHorariosAna(slots, agora, true)).toBe(esperado); });
});
