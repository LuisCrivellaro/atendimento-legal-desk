import { describe, expect, it } from 'vitest';
import { parManhaTardeAna } from '@/lib/atendimento/ana-scheduling';
import { linhaDoisHorariosAna } from '@/lib/atendimento/ana-rules';
import { interpretarRespostaRevisora } from '@/lib/atendimento/consulta-processo';
import { textoRelatorio } from '@/lib/atendimento/relatorio-diario';

const sp = (d: string, h: string) => new Date(`${d}T${h}:00-03:00`).toISOString();

describe('Prompt de 04/11 — dia, 3 opções, autorização e relatório', () => {
  it('mesmo dia: manhã e tarde com o dia em linha', () => {
    const now = new Date(sp('2026-11-04', '07:00'));
    const s = parManhaTardeAna([sp('2026-11-04', '10:00'), sp('2026-11-04', '14:30'), sp('2026-11-05', '09:00')]);
    expect(s).toHaveLength(2);
    expect(linhaDoisHorariosAna(s, now)).toBe('Temos horários hoje (quarta-feira, 04/11) às 10h ou às 14h30');
  });
  it('dois dias: restante do 1º dia + manhã e fim de tarde do 2º', () => {
    const now = new Date(sp('2026-11-04', '13:00'));
    const s = parManhaTardeAna([sp('2026-11-04', '15:30'), sp('2026-11-05', '09:00'), sp('2026-11-05', '10:00'), sp('2026-11-05', '14:00'), sp('2026-11-05', '17:00')]);
    expect(s).toEqual([sp('2026-11-04', '15:30'), sp('2026-11-05', '09:00'), sp('2026-11-05', '17:00')]);
    expect(linhaDoisHorariosAna(s, now)).toBe('Temos horários hoje (quarta-feira, 04/11) às 15h30, ou quinta-feira (05/11) às 9h ou às 17h');
  });
  it('cadastrados na sexta (só tarde) continuam com 2 horários', () => {
    expect(parManhaTardeAna([sp('2026-11-06', '13:30'), sp('2026-11-06', '14:00'), sp('2026-11-06', '15:00')])).toHaveLength(2);
  });
  it('SIM da Dra. autoriza o envio do andamento', () => {
    expect(interpretarRespostaRevisora('Sim', ['AND-0001'])).toEqual({ acao: 'aprovar', codigo: 'AND-0001' });
    expect(interpretarRespostaRevisora('não', ['AND-0001'])).toEqual({ acao: 'recusar', codigo: 'AND-0001' });
  });
  it('relatório separa prioridade e agendamentos por cliente', () => {
    const t = textoRelatorio([{ grupo: 'prioridade', nome: 'ANA LIMA', telefone: '11', detalhe: 'urgente' }, { grupo: 'agendamento', nome: 'JOÃO', telefone: '22', detalhe: 'consulta' }], '2026-11-03');
    expect(t).toContain('🔴 ATENDER PRIMEIRO (1)\n1. ANA LIMA');
    expect(t).toContain('🟢 SOMENTE AGENDAMENTO (1)\n1. JOÃO');
  });
});
