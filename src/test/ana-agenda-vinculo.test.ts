import { describe, expect, it } from 'vitest';
import { classificarAgenda, identificarTipoCliente } from '@/lib/atendimento/intake-rules';
import { gerarHorarios, horarioPermitido } from '@/lib/atendimento/schedule-rules';
import { partesAgenda, selecionarOpcoesAna } from '@/lib/atendimento/ana-scheduling';

// Terça-feira, 03/11/2026, 12h em São Paulo.
const AGORA = new Date('2026-11-03T15:00:00.000Z');
const diaSemana = (iso: string) => {
  const p = partesAgenda(iso);
  return new Date(`${p['year']}-${p['month']}-${p['day']}T12:00:00Z`).getUTCDay();
};

describe('agendamento por tipo de cliente (Dra. Carolina, 03/11/2026)', () => {
  it('1. lead novo recebe somente opções de segunda a quinta', () => {
    const slots = gerarHorarios([], AGORA, 'novo', 12, 21);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const dia = diaSemana(s);
      expect(dia).toBeGreaterThanOrEqual(1);
      expect(dia).toBeLessThanOrEqual(4);
    }
    expect(horarioPermitido('2026-11-06T14:00:00-03:00', 'novo')).toBe(false); // sexta
  });

  it('2. cliente ativo recebe somente opções de sexta-feira', () => {
    const slots = gerarHorarios([], AGORA, 'cadastrado', 6, 21);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(diaSemana(s)).toBe(5);
    expect(horarioPermitido('2026-11-04T14:00:00-03:00', 'cadastrado')).toBe(false); // quarta
    expect(horarioPermitido('2026-11-06T13:30:00-03:00', 'cadastrado')).toBe(true);
  });

  it('3. contato antigo sem vínculo ativo não vira cliente ativo automaticamente', () => {
    const r = classificarAgenda({ local: { tipo: 'nao_encontrado' }, padraoLead: false });
    expect(r.tipo).toBeUndefined();
    expect(r.fonte).toBe('duvida');
    expect(r.confirmada).toBe(false);
  });

  it('4. cliente ativo que retorna em outra conversa continua identificado pelo cadastro', () => {
    const peloCadastro = classificarAgenda({ local: { tipo: 'unico', pessoa: { codigo: 116428, nome: 'LUIS FILIPE' } } });
    expect(peloCadastro).toEqual({ tipo: 'cadastrado', fonte: 'cadastro', confirmada: true });
    const persistido = classificarAgenda({ persistida: 'cadastrado', local: { tipo: 'nao_encontrado' } });
    expect(persistido.tipo).toBe('cadastrado');
    expect(persistido.fonte).toBe('manual');
  });

  it('5. telefone com cadastro duplicado vai para confirmação da equipe, sem classificação própria', () => {
    const r = classificarAgenda({ local: { tipo: 'duplicado', codigos: [10, 20] }, autodeclaracao: identificarTipoCliente('Já sou cliente do escritório'), padraoLead: true });
    expect(r.tipo).toBeUndefined();
    expect(r.fonte).toBe('duvida');
  });

  it('6. horários oferecidos respeitam a disponibilidade real informada pela agenda', () => {
    const ocupado = { start: '2026-11-04T13:30:00.000Z', end: '2026-11-04T14:00:00.000Z' }; // quarta 10h30 SP
    const { slots } = selecionarOpcoesAna([ocupado], AGORA, 'novo');
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const inicio = Date.parse(s), fim = inicio + 30 * 60000;
      expect(inicio < Date.parse(ocupado.end) && fim > Date.parse(ocupado.start)).toBe(false);
      expect(horarioPermitido(s, 'novo')).toBe(true);
    }
  });

  it('autodeclaração sem cadastro define a carteira, mas não conta como confirmação', () => {
    const r = classificarAgenda({ local: { tipo: 'nao_encontrado' }, autodeclaracao: 'cadastrado' });
    expect(r).toEqual({ tipo: 'cadastrado', fonte: 'autodeclaracao', confirmada: false });
  });
});
