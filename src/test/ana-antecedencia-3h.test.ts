import {describe,it,expect} from 'vitest';
import {selecionarOpcoesAna,horarioEspecificoLivre} from '@/lib/atendimento/ana-scheduling';
describe('antecedência mínima de 3 horas',()=>{
 // Terça 10/11/2026, 09:00 em São Paulo
 const now=new Date('2026-11-10T12:00:00Z');
 it('não oferece horários antes de 12h (3h após o contato)',()=>{
  const slots=selecionarOpcoesAna([],now,'novo').slots;
  expect(slots.length).toBeGreaterThan(0);
  expect(slots.every(s=>Date.parse(s)>=now.getTime()+3*3600_000)).toBe(true);
 });
 it('recusa pedido específico às 11h e aceita 13h30',()=>{
  expect(horarioEspecificoLivre('2026-11-10T14:00:00Z',[],'novo',now)).toBe(false);
  expect(horarioEspecificoLivre('2026-11-10T16:30:00Z',[],'novo',now)).toBe(true);
 });
});
