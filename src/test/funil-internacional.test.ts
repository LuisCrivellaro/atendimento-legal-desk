import { describe, it, expect } from 'vitest';
import { gatilhoLandingInternacional, passoFunil, MSG_PIX, MSG_LINK, MSG_CONFERENCIA } from '@/lib/atendimento/funil-internacional';
const f = { etapa: 'nome' as const, inicio: '2026-11-17T00:00:00Z' };
describe('funil internacional', () => {
  it('reconhece mensagens da landing page', () => {
    expect(gatilhoLandingInternacional('Olá Dra. Carolina, gostaria de agendar uma consulta Família Internacional.')).toBe(true);
    expect(gatilhoLandingInternacional('Olá, Dra. Carolina Santos! Gostaria de agendar uma consulta internacional sobre Adoção Internacional.')).toBe(false);
  });
  it('não ativa para mensagens comuns', () => {
    expect(gatilhoLandingInternacional('Olá, gostaria de agendar uma consulta')).toBe(false);
  });
  it('nome completo leva ao valor de R$ 500 / € 90', () => {
    const p = passoFunil(f, 'Maria da Silva', false)!;
    expect(p.funil.etapa).toBe('pagamento');
    expect(p.mensagem).toContain('€ 90');
  });
  it('opção 1 envia chave PIX e opção 2 o link Mercado Pago', () => {
    const pg = { ...f, etapa: 'pagamento' as const };
    expect(passoFunil(pg, '1', false)!.mensagem).toBe(MSG_PIX);
    expect(MSG_PIX).toContain('+5511918582706');
    expect(passoFunil(pg, '2', false)!.mensagem).toBe(MSG_LINK);
    expect(MSG_LINK).toContain('https://mpago.la/2EkJjJq');
  });
  it('comprovante coloca em conferência e depois fica em silêncio', () => {
    const p = passoFunil({ ...f, etapa: 'pix' }, '', true)!;
    expect(p.mensagem).toBe(MSG_CONFERENCIA);
    expect(passoFunil(p.funil, 'oi?', false)).toBeUndefined();
  });
});
import { msgPagoComHorarios } from '@/lib/atendimento/funil-internacional';
describe('pagamento confirmado', () => {
  it('confirmação já leva os horários', () => {
    const m = msgPagoComHorarios('1 - Segunda-feira, 23/11, às 9h', 'O que fica melhor para você?');
    expect(m).toContain('Pagamento confirmado');
    expect(m).toContain('Segunda-feira, 23/11, às 9h');
    expect(m).not.toContain('HORÁRIOS');
  });
});
