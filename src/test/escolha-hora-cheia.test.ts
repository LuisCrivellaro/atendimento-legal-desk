import {expect,test} from 'vitest';
import {escolherHorarioAna} from '@/lib/atendimento/ana-scheduling';
const h=['2026-11-16T12:00:00.000Z','2026-11-16T20:00:00.000Z'];
test('"Pode ser as 17" escolhe 17h oferecido',()=>expect(escolherHorarioAna(h,'Pode ser as 17')).toBe(h[1]));
test('"As 17 horas" escolhe 17h oferecido',()=>expect(escolherHorarioAna(h,'As 17 horas')).toBe(h[1]));
test('"às 9" escolhe 9h oferecido',()=>expect(escolherHorarioAna(h,'às 9')).toBe(h[0]));
