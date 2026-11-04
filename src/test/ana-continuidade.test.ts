import { describe, it, expect } from 'vitest';
import type { Conversa, Mensagem } from '@/lib/mock-data';
import { conversas } from '@/lib/mock-data';
import { contextoPersistente, historicoContato, nomeConhecido, atendimentoIniciado, cobraRetorno, registrarRetorno, resultadoRetorno, semReintroducao } from '@/lib/atendimento/ana-contexto';
import { retornoIdentificadoAna } from '@/lib/atendimento/ana-retomada';
import { autorizaEnvioAna } from '@/lib/atendimento/ana-execution';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-04T17:00:00Z');
const iso = (msAtras: number) => new Date(AGORA.getTime() - msAtras).toISOString();
function msg(id: string, de: Mensagem['de'], texto: string, msAtras: number): Mensagem {
  return { id, de, texto, canal: 'ultramsg', hora: '', dataHora: iso(msAtras) };
}
/** Cliente identificado há dias, com agendamento tratado e promessa de retorno da equipe. */
function clienteAntigo(extra: Mensagem[] = []): Conversa {
  const base = conversas[0]; if (!base) throw new Error('Fixture ausente');
  return {
    ...base, id: 'antigo', nome: 'Contato', tipoClienteAgenda: 'novo', timeline: [],
    agenteAna: { dados: { nome: '', cpf: '', email: '', assunto: 'consulta trabalhista' }, horariosApresentados: ['2026-10-28T13:30:00-03:00'] },
    consultaAgendada: '2026-10-30T14:00:00-03:00',
    mensagens: [
      msg('m1', 'cliente', 'oi', 40 * DIA),
      msg('m2', 'cliente', 'Bom dia. É a Sônia.', 40 * DIA - 60000),
      msg('m3', 'escritorio', 'Temos horários terça às 10h ou às 15h30. O que fica melhor para você?', 40 * DIA - 120000),
      msg('m4', 'cliente', 'Preciso saber sobre minha consulta trabalhista', 39 * DIA),
      msg('m5', 'escritorio', 'Vou verificar com a doutora e te dou um retorno.', 39 * DIA - 60000),
      ...extra,
    ],
  };
}

describe('Continuidade real da Anne (anexo de correção crítica)', () => {
  it('1. resposta após 24 horas é retorno identificado, nunca novo atendimento', () => {
    const c = clienteAntigo([msg('nova', 'cliente', 'bom dia', 0)]);
    expect(retornoIdentificadoAna(c, 'nova', 'ultramsg', AGORA)).toBe(true);
    expect(atendimentoIniciado(c, 'ultramsg', 'nova')).toBe(true);
    expect(nomeConhecido(c, 'ultramsg')).toBe('Sônia');
  });
  it('2. resposta após 7 dias mantém identidade e contexto', () => {
    const c = clienteAntigo([msg('nova', 'cliente', 'oi, tudo bem?', 6 * DIA)]);
    expect(retornoIdentificadoAna(c, 'nova', 'ultramsg', AGORA)).toBe(true);
    const ctx = contextoPersistente(c, 'ultramsg');
    expect(ctx.continuidade.nome_conhecido).toBe('Sônia');
    expect(ctx.continuidade.consulta).toBe('2026-10-30T14:00:00-03:00');
  });
  it('3. resposta após 30 dias ainda é o mesmo atendimento', () => {
    const c = clienteAntigo([msg('nova', 'cliente', 'olá', 29 * DIA)]);
    expect(retornoIdentificadoAna(c, 'nova', 'ultramsg', AGORA)).toBe(true);
    expect(semReintroducao('Olá,\n\nSeja bem vindo (a)😊\n\nEquipe CS Advocacia\nwww.carolinasantos.com.br\n\nVou te ajudar!\nComo posso ajudar?', true)).toBe('Como posso ajudar?');
  });
  it('4. "Olá, conseguiu verificar?" vira tarefa de retorno real, sem inventar providência', () => {
    const c = clienteAntigo([msg('cobra', 'cliente', 'Olá, conseguiu verificar?', 7 * DIA)]);
    expect(cobraRetorno(c.mensagens.at(-1)!.texto)).toBe(true);
    const comTarefa = registrarRetorno(c, 'ultramsg', 'cobra', 'owner', AGORA);
    expect(comTarefa.tarefasRetorno?.[0]).toMatchObject({ status: 'pendente', responsavelId: 'owner', assunto: 'Preciso saber sobre minha consulta trabalhista' });
    const r = resultadoRetorno(comTarefa, 'ultramsg');
    expect(r.encaminhar_humano).toBe(true);
    expect(r.mensagem).not.toMatch(/verifiquei|confirmei|está tudo certo/i);
  });
  it('5. resposta sobre agendamento da semana anterior preserva horários oferecidos', () => {
    const c = clienteAntigo([msg('nova', 'cliente', 'Por conta do feriado não consegui, podemos ver outro horário?', 7 * DIA)]);
    const ctx = contextoPersistente(c, 'ultramsg');
    expect(ctx.continuidade.horarios_ja_apresentados).toContain('2026-10-28T13:30:00-03:00');
    expect(ctx.continuidade.nome_conhecido).toBe('Sônia');
    expect(atendimentoIniciado(c, 'ultramsg', 'nova')).toBe(true);
  });
  it('6. contato antigo com novo assunto jurídico não vira novo lead', () => {
    const c = clienteAntigo([msg('nova', 'cliente', 'Agora preciso de ajuda com uma questão de pensão alimentícia', 10 * DIA)]);
    expect(nomeConhecido(c, 'ultramsg')).toBe('Sônia');
    expect(atendimentoIniciado(c, 'ultramsg', 'nova')).toBe(true);
    expect(cobraRetorno(c.mensagens.at(-1)!.texto)).toBe(false);
  });
  it('7. histórico vem só do registro persistido, completo e em ordem cronológica mesmo gravado fora de ordem', () => {
    const c = clienteAntigo();
    // Simula entregas do webhook fora de ordem: mensagem antiga gravada depois da recente.
    c.mensagens = [c.mensagens[4]!, c.mensagens[0]!, c.mensagens[3]!, c.mensagens[1]!, c.mensagens[2]!];
    const h = historicoContato(c, 'ultramsg');
    expect(h.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(h).toHaveLength(5);
  });
  it('8. resposta da equipe pelo WhatsApp pausa a Anne e bloqueia envio automático', () => {
    const c = clienteAntigo([msg('humano', 'escritorio', 'Sou da equipe, vou assumir seu atendimento.', 0)]);
    c.agenteAna = { ...c.agenteAna, humano: true, controleHumanoEm: AGORA.toISOString() };
    expect(autorizaEnvioAna(c, 'humano', c.agenteAna.controleHumanoEm)).toBe(false);
  });
});
