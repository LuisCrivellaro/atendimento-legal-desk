import { describe, it, expect } from 'vitest';
import { avaliarSaude, alertasNovos } from '@/lib/monitoramento/saude';
import { excessoRespostasAna } from '@/lib/atendimento/ana-execution';
const base = { agora: Date.parse('2026-11-03T20:00:00Z'), backendOk: true, whatsapp: { configurado: true, status: 'authenticated' }, webhook: { correto: true }, ia: { chaveOk: true, chamadasHoje: 10, limite: 1500, bloqueadasHoje: 0 }, errosUltimas24h: 0, pendentes: 0, incertas: 0, agendaErros24h: 0 };
describe('monitoramento da Ana', () => {
  it('tudo normal', () => expect(avaliarSaude(base).geral).toBe('ok'));
  it('WhatsApp desconectado gera alerta', () => { const s = avaliarSaude({ ...base, whatsapp: { configurado: true, status: 'disconnected' } }); expect(s.geral).toBe('falha'); expect(s.alertas[0]).toContain('WhatsApp'); });
  it('limite de IA atingido gera alerta', () => expect(avaliarSaude({ ...base, ia: { ...base.ia, bloqueadasHoje: 1 } }).alertas).toContain('Limite diário de consumo de IA atingido'));
  it('Ana parada com pendência gera alerta', () => expect(avaliarSaude({ ...base, pendentes: 1, ultimaRecebida: '2026-11-03T19:30:00Z', ultimaEnviada: '2026-11-03T19:00:00Z' }).alertas.some(a => a.includes('15 minutos'))).toBe(true));
  it('não repete alerta já registrado', () => expect(alertasNovos(['A'], ['A', 'B'])).toEqual(['B']));
  it('bloqueia a 7ª resposta em 10 minutos', () => {
    const agora = Date.parse('2026-11-03T20:00:00Z');
    const msgs = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, de: 'escritorio' as const, texto: 'x', hora: '', respostaAnaDe: `c${i}`, dataHora: new Date(agora - i * 60000).toISOString() }));
    expect(excessoRespostasAna({ mensagens: msgs } as never, agora)).toBe(true);
    expect(excessoRespostasAna({ mensagens: msgs.slice(0, 5) } as never, agora)).toBe(false);
  });
});
