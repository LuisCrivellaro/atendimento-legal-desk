import { describe, expect, it, vi } from 'vitest';
import { conferirRespostaAtual, type fontesDaConversa } from '@/lib/atendimento/secretaria/seguranca';

type Fonte = Parameters<typeof fontesDaConversa>[0];
const inicio = '2026-11-30T20:30:00.000Z';
const link = 'https://meet.google.com/abc-defg-hij';
const anterior: Fonte = { mensagens: [], agenteAna: { horariosTeste: [inicio], agendaReal: true } };
const reservada: Fonte = { ...anterior, consultaAgendada: inicio, agenteAna: { reservaCalendar: { id: 'pj:65949311', inicio, fim: '2026-11-30T21:00:00.000Z', meetUrl: link } } };
const confirmacao = `Consulta confirmada em 30/11/2026, às 17h30. Acesse a reunião: ${link}`;

describe('confirmação usa o recibo salvo depois da reserva', () => {
  it('relê o recibo atual e libera o link real da consulta de 30/11 às 17h30', async () => {
    let salva = anterior;
    const ler = vi.fn(async () => salva);
    salva = reservada;
    expect(await conferirRespostaAtual(confirmacao, ler)).toEqual([]);
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it('sem recibo continua bloqueando o link, mesmo com horário ofertado', async () => {
    expect(await conferirRespostaAtual(confirmacao, async () => anterior)).toEqual(['link meet.google.com/abc-defg-hij']);
  });

  it('bloqueia outro link que não corresponde ao recibo desta conversa', async () => {
    expect(await conferirRespostaAtual(confirmacao.replace(link, 'https://meet.google.com/xyz-abcd-efg'), async () => reservada)).toEqual(['link meet.google.com/xyz-abcd-efg']);
  });

  it('falha de leitura não libera a confirmação nem usa fonte antiga', async () => {
    await expect(conferirRespostaAtual(confirmacao, async () => { throw new Error('Leitura indisponível'); })).rejects.toThrow('Leitura indisponível');
  });
});