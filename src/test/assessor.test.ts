import { expect,it } from 'vitest';
import { buildAssessor, diaEvento, rotuloEvento } from '@/lib/assessor';
it('prioritizes fatal deadlines in 2 days and counts sidebar in 7 days',()=>{const a=buildAssessor([{id:'1',nome:'Cliente',pipeline:6,mine:true,prazos:[{data:'2026-10-22',texto:'Fatal',fatal:true},{data:'2026-10-27',texto:'Outro',fatal:true},{data:'2026-10-20',texto:'Tarefa'}]}],'2026-10-20');expect(a.metrics.fatal).toBe(1);expect(a.badges['/']).toBe(2);expect(a.tasks.filter(t=>t.urgent).length).toBe(1);expect(a.tasks.some(t=>t.label.includes('Vence hoje'))).toBe(true);expect(a.metrics.protocols).toBe(1);});
it('does not relabel ordinary deadlines as fatal',()=>expect(buildAssessor([{id:'1',nome:'Cliente',pipeline:3,mine:true,prazos:[{data:'2026-10-21',texto:'Prazo normal'}]}],'2026-10-20').metrics.fatal).toBe(0));
it('data de evento gravada sem fuso não muda de dia nem ganha hora', () => {
  expect(rotuloEvento('2026-11-11')).toBe('11/11/2026');
  expect(rotuloEvento('2026-11-11T14:30')).toBe('11/11/2026 · 14:30');
  expect(rotuloEvento('2026-11-11T17:30:00.000Z')).toBe('11/11/2026 · 14:30');
  expect(diaEvento('2026-11-11')).toBe('2026-11-11');
  expect(diaEvento('2026-11-12T01:00:00Z')).toBe('2026-11-11');
  expect(rotuloEvento(undefined)).toBe('');
});
it('audiências e perícias: só de hoje em diante, em ordem de data', () => {
  const mv = (id: string, eventoData: string, concluido = false) => ({ id, cnj: '0', data: '2026-11-01', texto: id, concluido, tipo: 'perícia' as const, eventoData });
  const a = buildAssessor([{ id: '1', nome: 'Cliente', pipeline: 8, mine: true, prazos: [], movements: [mv('passada', '2026-11-10'), mv('depois', '2026-12-02T09:00'), mv('hoje', '2026-11-27'), mv('feita', '2026-12-01', true)] }], '2026-11-27');
  expect(a.events.map(e => e.id)).toEqual(['hoje', 'depois']);
  expect(a.metrics.events).toBe(2);
});
