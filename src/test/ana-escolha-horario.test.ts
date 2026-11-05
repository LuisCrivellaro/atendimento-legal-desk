import { describe, it, expect } from 'vitest';
import { escolherHorarioAna } from '@/lib/atendimento/ana-scheduling';

// Opções oferecidas (horário de São Paulo): seg 09/11 9h e seg 09/11 17h30.
const NOVE = '2026-11-09T12:00:00.000Z';
const DEZESSETE_E_MEIA = '2026-11-09T20:30:00.000Z';
const HOJE_16 = '2026-11-05T19:00:00.000Z';

describe('escolha do horário pelo cliente', () => {
  it('opção 2 escolhe 17h30, nunca 9h', () => {
    expect(escolherHorarioAna([NOVE, DEZESSETE_E_MEIA], '2')).toBe(DEZESSETE_E_MEIA);
  });
  it('"Segunda-feira (09/11) às 17h30" escolhe 17h30 e não "a segunda opção" (caso real de 05/11)', () => {
    expect(escolherHorarioAna([HOJE_16, NOVE, DEZESSETE_E_MEIA], 'Olá,\nSegunda-feira feira (09/11) às 17h30.\nPor favor.')).toBe(DEZESSETE_E_MEIA);
  });
  it('"segunda às 9h" escolhe 9h', () => {
    expect(escolherHorarioAna([HOJE_16, NOVE, DEZESSETE_E_MEIA], 'segunda às 9h')).toBe(NOVE);
  });
  it('"a segunda opção" continua escolhendo a posição 2', () => {
    expect(escolherHorarioAna([NOVE, DEZESSETE_E_MEIA], 'a segunda opção')).toBe(DEZESSETE_E_MEIA);
  });
});
