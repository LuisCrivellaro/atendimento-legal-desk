import { describe, expect, it } from 'vitest';
import { relacionamentoAna, respondeuNovaDemanda } from '@/lib/atendimento/ana-relacionamento';
import { normalizarEscolhaHorario } from '@/lib/atendimento/ana-scheduling';
import { SAUDACAO_CLIENTE_NOVO } from '@/lib/atendimento/ana-rules';
import type { Conversa, Mensagem } from '@/lib/mock-data';

// Pergunta antiga, removida em 26/11/2026 (a Anne não a envia mais): só simula histórico já gravado, cuja resposta continua valendo.
const PERG = 'Esse assunto é de um atendimento que já está em andamento conosco ou é uma nova demanda?';
const msg = (de: 'cliente' | 'escritorio', texto: string, autor?: string) => ({ id: texto, de, texto, hora: '', ...(autor ? { autor } : {}) }) as unknown as Mensagem;
const conv = (mensagens: Mensagem[]) => ({ id: 'x', telefone: '5515991787788', canal: 'ultramsg', etapa: 'inicial', mensagens, timeline: [] }) as unknown as Conversa;

describe('casos reais de 23/11/2026', () => {
  it('Caso A: "E uma nova demanda" após a pergunta vira novo lead mesmo sem ProJuris', () => {
    const c = conv([msg('cliente', 'Oi'), msg('escritorio', PERG, 'Ana · assistente virtual'), msg('cliente', 'E uma nova demanda')]);
    expect(respondeuNovaDemanda(c.mensagens)).toBe(true);
    expect(relacionamentoAna(c, c.telefone, 'ultramsg', undefined).situacao).toBe('novo_lead');
  });
  it('Caso A: variações "Nova demanda." e "Uma nova demanda"', () => {
    for (const t of ['Nova demanda.', 'Uma nova demanda', 'é nova', 'Situação nova'])
      expect(respondeuNovaDemanda([msg('escritorio', PERG, 'Ana'), msg('cliente', t)])).toBe(true);
    expect(respondeuNovaDemanda([msg('escritorio', PERG, 'Ana'), msg('cliente', 'Já está em andamento')])).toBe(false);
  });
  it('Caso B: depois da saudação gratuita da Anne, a escolha do horário não reabre a pergunta', () => {
    const c = conv([msg('cliente', 'Olá Dra. Carolina, gostaria de agendar uma consulta gratuita.'), msg('escritorio', `${SAUDACAO_CLIENTE_NOVO}\nTemos horários hoje às 14h30`, 'Ana · assistente virtual'), msg('cliente', 'Hoje as 14v30')]);
    expect(relacionamentoAna(c, c.telefone, 'ultramsg', undefined).situacao).toBe('novo_lead');
  });
  it('Caso B: fala humana da equipe devolve a decisão para a equipe', () => {
    const c = conv([msg('escritorio', `${SAUDACAO_CLIENTE_NOVO}`, 'Ana · assistente virtual'), msg('escritorio', 'Está agendado', 'Equipe · celular do escritório'), msg('cliente', 'ok')]);
    expect(relacionamentoAna(c, c.telefone, 'ultramsg', undefined).situacao).toBe('incerto');
  });
  it('Caso B: "14v30" é lido como 14h30 e a saudação não tem "Olá ,"', () => {
    expect(normalizarEscolhaHorario('Hoje as 14v30')).toContain('14h30');
    expect(SAUDACAO_CLIENTE_NOVO.startsWith('Olá ,')).toBe(false);
  });
});
