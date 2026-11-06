import { describe, it, expect } from 'vitest';
import { escolherHorarioAna } from '@/lib/atendimento/ana-scheduling';
import { chosenSlot } from '@/lib/atendimento';
// Conversa real de 06/11/2026: oferta segunda (09/11) às 9h30 ou às 17h.
const slots=['2026-11-09T12:30:00.000Z','2026-11-09T20:00:00.000Z'];
describe('escolha de horário digitada às pressas (Marjore)',()=>{
  for(const t of ['As9:30','as 9h30','9:30','9 e meia','Pode ser o primeiro','às 9.30','AS9H30'])
    it(`"${t}" escolhe 9h30`,()=>expect(escolherHorarioAna(slots,t)).toBe(slots[0]));
  it('"Prefiro o das 17h" escolhe 17h',()=>expect(escolherHorarioAna(slots,'Prefiro o das 17h')).toBe(slots[1]));
  it('nome junto com horário escolhe 9h30',()=>expect(escolherHorarioAna(slots,'Meu nome é Marjore Rodrigues Cabreira e pode ser às 9h30')).toBe(slots[0]));
  it('chosenSlot também aceita "As9:30"',()=>expect(chosenSlot(slots,'As9:30')).toBe(slots[0]));
  it('nome sozinho não escolhe horário',()=>expect(escolherHorarioAna(slots,'Marjore Rodrigues Cabreira')).toBeUndefined());
});
