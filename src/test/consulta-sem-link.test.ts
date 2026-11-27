import { describe, expect, it } from 'vitest';
import type { Conversa } from '@/lib/mock-data';
import { avisosPendentes } from '@/lib/atendimento/avisos-equipe';
import { avisarConsultaSemLink } from '@/lib/atendimento/situacao-consulta';

/** Consulta marcada sem link do Meet: a equipe precisa saber na hora, porque a confirmação ao cliente sai sem link. */

const AGORA = new Date('2026-11-27T15:00:00.000Z');
const INICIO = '2026-12-01T18:00:00.000Z'; // terça, 15h em São Paulo
const OUTRO = '2026-12-02T12:00:00.000Z'; // quarta, 9h em São Paulo
const MEET = 'https://meet.google.com/abc-defg-hij';
const base = (): Pick<Conversa, 'avisosEquipe' | 'timeline'> => ({ timeline: [] });

describe('aviso de consulta marcada sem link do Meet', () => {
  it('com link do Meet entregável não cria aviso nem muda a conversa', () => {
    const c = base();
    expect(avisarConsultaSemLink(c, { inicio: INICIO, meetUrl: MEET }, AGORA)).toBe(c);
  });

  it('sem link cria um aviso prioritário com data e horário, uma única vez', () => {
    const uma = avisarConsultaSemLink(base(), { inicio: INICIO }, AGORA);
    const duas = avisarConsultaSemLink(uma, { inicio: INICIO }, new Date('2026-11-27T15:05:00.000Z'));
    expect(avisosPendentes(duas)).toHaveLength(1);
    expect(duas.avisosEquipe?.[0]).toMatchObject({ id: `consulta-sem-link:${INICIO}`, tipo: 'confirmacao40', prioridade: true, criadoEm: AGORA.toISOString() });
    expect(duas.avisosEquipe?.[0]?.texto).toMatch(/01\/12\/2026 às 15h marcada sem link do Meet/);
    expect(duas.avisosEquipe?.[0]?.texto).toMatch(/enviar o link ao cliente antes do horário/);
    expect(duas.timeline).toHaveLength(1);
  });

  it.each([
    ['link do evento da agenda (não é sala do Meet)', 'https://www.google.com/calendar/event?eid=abc'],
    ['endereço sem HTTPS', 'http://meet.google.com/abc-defg-hij'],
    ['texto vazio', ''],
  ])('%s conta como sem link, igual à confirmação ao cliente', (_nome, meetUrl) => {
    expect(avisosPendentes(avisarConsultaSemLink(base(), { inicio: INICIO, meetUrl }, AGORA))).toHaveLength(1);
  });

  it('aviso resolvido pela equipe não reabre para o mesmo horário', () => {
    const c = avisarConsultaSemLink(base(), { inicio: INICIO }, AGORA);
    const resolvido = { ...c, avisosEquipe: c.avisosEquipe?.map(a => ({ ...a, resolvidoEm: AGORA.toISOString(), resolvidoPor: 'Equipe' })) };
    expect(avisosPendentes(avisarConsultaSemLink(resolvido, { inicio: INICIO }, AGORA))).toHaveLength(0);
  });

  it('remarcada para outro horário: o aviso antigo deixa de valer e o novo horário sem link ganha o seu', () => {
    const antes = avisarConsultaSemLink(base(), { inicio: OUTRO }, AGORA);
    const depois = avisarConsultaSemLink(antes, { inicio: INICIO }, AGORA);
    expect(depois.avisosEquipe?.find(a => a.id === `consulta-sem-link:${OUTRO}`)).toMatchObject({ resolvidoPor: 'agenda (consulta mudou de horário)' });
    expect(avisosPendentes(depois).map(a => a.id)).toEqual([`consulta-sem-link:${INICIO}`]);
  });

  it('remarcada com link: o aviso do horário antigo deixa de valer e nenhum novo é criado', () => {
    const antes = avisarConsultaSemLink(base(), { inicio: OUTRO }, AGORA);
    expect(avisosPendentes(avisarConsultaSemLink(antes, { inicio: INICIO, meetUrl: MEET }, AGORA))).toHaveLength(0);
  });

  it('não mexe em avisos de outros assuntos', () => {
    const c = { ...base(), avisosEquipe: [{ id: `registro-consulta:${OUTRO}`, tipo: 'confirmacao40' as const, texto: 'registrar', criadoEm: AGORA.toISOString() }] };
    expect(avisarConsultaSemLink(c, { inicio: INICIO, meetUrl: MEET }, AGORA)).toBe(c);
  });
});
