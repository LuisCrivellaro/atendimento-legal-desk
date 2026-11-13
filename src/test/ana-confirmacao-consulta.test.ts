import { describe, expect, it } from 'vitest';
import { mensagemConfirmacaoAna } from '@/lib/atendimento/ana-scheduling';
const INICIO = '2026-10-30T18:00:00.000Z';
const LINK = 'https://meet.google.com/csk-dywz-oft';
describe('mensagem após agendar', () => {
  it('usa o modelo oficial com primeiro nome, data, horário e link', () => {
    expect(mensagemConfirmacaoAna(INICIO, LINK, 'maria da silva')).toBe(
      'Olá, Maria! 😊 Sua consulta inicial com a Dra. Carolina está agendada!\n\n📅 Data: 30/10/2026\n🕒 Horário: 15h\n🔗 Link: https://meet.google.com/csk-dywz-oft\n\nPedimos que entre alguns minutos antes. Até lá!');
  });
  it('omite link inválido ou ausente, nunca inventa', () => {
    expect(mensagemConfirmacaoAna(INICIO, 'http://meet.google.com/x', 'Ana')).not.toContain('Link');
    expect(mensagemConfirmacaoAna('2026-10-30T17:30:00.000Z')).toContain('🕒 Horário: 14h30');
  });
});
