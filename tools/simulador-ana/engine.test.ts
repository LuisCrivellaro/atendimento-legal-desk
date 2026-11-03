import { describe, it, expect } from 'vitest';
import { SimuladorAna } from './engine';
import type { AnaResult } from '@/lib/atendimento/ana-rules';

const base = (o: Partial<AnaResult> = {}): AnaResult => ({ acao: 'enviar', mensagem: 'Olá!', motivo_aprovacao: '', intencao: 'duvida_geral', urgente: false, encaminhar_humano: false, dados_coletados: { nome: '', cpf: '', assunto: '', email: '' }, proximo_passo: '', ...o });

describe('motor do simulador', () => {
  it('agenda, confirma e cancela com as regras reais', async () => {
    const roteiro: AnaResult[] = [
      base({ mensagem: 'Olá! Sou a Ana, assistente virtual da CS Lawyers. Como posso ajudar?' }),
      base({ intencao: 'agendamento', mensagem: 'Obrigada, Mariana!', dados_coletados: { nome: 'Mariana Souza Lima', cpf: '', assunto: '', email: '' } }),
      base({ intencao: 'agendamento', mensagem: 'Perfeito.' }),
      base({ intencao: 'agendamento', mensagem: 'Entendi.' }),
      base({ intencao: 'agendamento', mensagem: 'Ok.' }),
      base({ intencao: 'outro', mensagem: 'Vou chamar a equipe.' , encaminhar_humano: true}),
    ];
    let i = 0;
    const sim = new SimuladorAna(async () => {const resultado=roteiro[Math.min(i++,roteiro.length-1)];if(!resultado)throw new Error('Roteiro ausente');return {resultado:structuredClone(resultado),bruto:'{}'};}, { instrucoes: '', proibidos: ['honorários'], exemplos: [] });
    await sim.receber('Oi, boa tarde');
    const offered=sim.conv.agenteAna?.horariosTeste??[];
    expect(offered).toHaveLength(3);
    const t3 = await sim.receber('Mariana Souza Lima');
    expect(t3.eventos.some(e=>e.includes('consultou a agenda'))).toBe(false);
    expect(sim.conv.agenteAna?.horariosTeste).toEqual(offered);
    expect(sim.conv.agenteAna?.dados?.nome).toBe('Mariana Souza Lima');
    const t4 = await sim.receber('a primeira'); console.log('T4', t4.enviada, t4.eventos);
    expect(sim.conv.consultaAgendada).toBeTruthy();
    expect(sim.agenda.some(e => e.daAna)).toBe(true);
    const t5 = await sim.receber('Quero cancelar minha consulta'); console.log('T5', t5.enviada);
    expect(t5.enviada).toContain('Quer mesmo cancelar');
    const t6 = await sim.receber('sim'); console.log('T6', t6.enviada, t6.eventos);
    expect(sim.conv.consultaAgendada).toBeUndefined();
    expect(sim.agenda.some(e => e.daAna)).toBe(false);
    const t7 = await sim.receber('Quero falar com a doutora'); console.log('T7', t7.enviada);
    expect(sim.conv.agenteAna?.humano).toBe(true);
    const t8 = await sim.receber('alô?'); expect(t8.semResposta).toBeTruthy();
  });
});
