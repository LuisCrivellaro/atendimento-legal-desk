import { describe, it, expect } from 'vitest';
import { aplicarRegrasAna as regrasProducao, violenciaDomesticaAna as vdProducao, riscoImediatoAna as riscoProducao } from '@/lib/ana-claude/regras';
import { aplicarRegrasAna as regrasSimulador, violenciaDomesticaAna as vdSimulador } from '@/lib/atendimento/ana-rules';

const base = { acao: 'enviar' as const, mensagem: 'Como posso ajudar?', motivo_aprovacao: '', intencao: 'novo_caso' as const, urgente: false, encaminhar_humano: false, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '' };

const cenarios = [
  'Preciso de ajuda urgente com violência doméstica.',
  'Meu companheiro me agride e quero saber meus direitos.',
  'Quero entrar com medida protetiva.',
  'Já sofri violência doméstica e preciso de uma advogada.',
];

describe('violência doméstica — produção (ana-claude)', () => {
  for (const texto of cenarios) {
    it(`acolhe e prioriza: "${texto.slice(0, 40)}..."`, () => {
      const r = regrasProducao(base, 'Automática', texto, []);
      expect(r.urgente).toBe(true);
      expect(r.acao).toBe('enviar');
      expect(r.mensagem).not.toContain('190');
      expect(r.mensagem).not.toMatch(/procure a pol[ií]cia/i);
      expect(r.mensagem).toMatch(/hor[aá]rios dispon[ií]veis/i); expect(r.mensagem).not.toMatch(/\?|me contar|avaliar|registrad/i);
      expect(r.mensagem).toMatch(/Dra\. Carolina atua em casos de viol[eê]ncia dom[eé]stica/i);
      expect(r.proximo_passo).toContain('URGENTE');
    });
  }
  it('risco imediato pergunta se está em local seguro, sem 190', () => {
    const r = regrasProducao(base, 'Automática', 'Estou sendo ameaçada neste momento.', []);
    expect(r.urgente).toBe(true);
    expect(r.mensagem).not.toContain('190');
    expect(r.mensagem).toMatch(/local seguro/i);
    expect(r.mensagem).toMatch(/serviços de emergência/i);
    expect(r.proximo_passo).toContain('risco imediato');
  });
  it('remove 190 se a IA incluir na resposta', () => {
    const r = regrasProducao({ ...base, mensagem: 'Ligue 190 agora. Sinto muito, vamos te ajudar.' }, 'Automática', 'Meu companheiro me agride', []);
    expect(r.mensagem).not.toContain('190');
  });
  it('modo Sugerir vira rascunho com o acolhimento', () => {
    const r = regrasProducao(base, 'Sugerir', 'Quero entrar com medida protetiva.', []);
    expect(r.acao).toBe('rascunho');
    expect(r.urgente).toBe(true);
    expect(r.mensagem).not.toContain('190');
  });
  it('modo Desligada não escreve ao cliente', () => {
    const r = regrasProducao(base, 'Desligada', 'Preciso de ajuda com violência doméstica.', []);
    expect(r.acao).toBe('nenhuma');
  });
  it('detecta os termos do anexo', () => {
    expect(vdProducao('sofri violência doméstica')).toBe(true);
    expect(vdProducao('meu companheiro me agride')).toBe(true);
    expect(vdProducao('quero medida protetiva')).toBe(true);
    expect(vdProducao('estou sendo ameaçada')).toBe(true);
    expect(vdProducao('quero agendar uma consulta')).toBe(false);
    expect(riscoProducao('estou sendo ameaçada neste momento')).toBe(true);
    expect(riscoProducao('já sofri violência doméstica ano passado')).toBe(false);
  });
});

describe('violência doméstica — simulador (atendimento/ana-rules)', () => {
  for (const texto of [...cenarios, 'Estou sendo ameaçada neste momento.']) {
    it(`acolhe e prioriza: "${texto.slice(0, 40)}..."`, () => {
      const r = regrasSimulador(base, 'Automática', texto, []);
      expect(r.urgente).toBe(true);
      expect(r.acao).toBe('enviar');
      expect(r.mensagem).not.toContain('190');
      expect(r.mensagem).toMatch(/hor[aá]rios dispon[ií]veis/i); expect(r.mensagem).not.toMatch(/\?|me contar|avaliar|registrad/i);
      expect(r.proximo_passo).toContain('URGENTE');
    });
  }
  it('detecção espelha a produção', () => {
    expect(vdSimulador('meu companheiro me agride')).toBe(true);
    expect(vdSimulador('quero agendar uma consulta')).toBe(false);
  });
});

import { limparForaEscopoAna } from '@/lib/ana-claude/regras';
describe('escopo exclusivo de agendamento', () => {
  it('remove perguntas investigativas e regras internas da agenda', () => {
    const m = limparForaEscopoAna('Entendi. Isso está acontecendo agora ou já aconteceu?\nAs consultas para clientes já cadastrados acontecem só às sextas, à tarde.\nTenho estes horários: 1) seg, 10h');
    expect(m).toBe('Entendi.\nTenho estes horários: 1) seg, 10h');
  });
  it('remove promessas de encaminhamento e avaliação', () => {
    expect(limparForaEscopoAna('Deixei registrado como urgente para a equipe. A Dra. Carolina poderá avaliar sua situação.')).toBe('');
  });
});
