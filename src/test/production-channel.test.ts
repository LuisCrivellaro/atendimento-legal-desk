import { describe, expect, it, vi, afterEach } from 'vitest';
import { numeroUltraMsgPermitido, numerosUltraMsgPermitidos } from '@/lib/atendimento/production-channel';
import { enviarTextoUltramsg, enviarTextoRevisora } from '@/lib/atendimento/canais/ultramsg';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('UltraMsg restrito até segunda ordem', () => {
  it('libera exatamente os três números informados', () => {
    expect(numerosUltraMsgPermitidos).toEqual(['5511999600306', '5511942074361', '5566999844549']);
    expect(numeroUltraMsgPermitido('11999600306')).toBe(true);
    expect(numeroUltraMsgPermitido('+55 (11) 94207-4361')).toBe(true);
    expect(numeroUltraMsgPermitido('5511999600306@c.us')).toBe(true);
    expect(numeroUltraMsgPermitido('551199600306')).toBe(true);
    expect(numeroUltraMsgPermitido('5511999600306@g.us')).toBe(false);
    expect(numeroUltraMsgPermitido('5566999844549')).toBe(true);
  });
  it('adaptador não chama o provedor para destino fora da lista', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await enviarTextoUltramsg('5566999844550', 'oi', { instancia: 'test', token: 'test' })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('exceção envia apenas ao destino fixo da revisora sem liberar o envio comum', async () => {
    vi.stubEnv('REVISORA_WHATSAPP', '5511988887777'); vi.stubEnv('ULTRAMSG_INSTANCE_ID', 'test'); vi.stubEnv('ULTRAMSG_TOKEN', 'test');
    const f = vi.fn().mockResolvedValue(Response.json({ sent: true, id: '1' })); vi.stubGlobal('fetch', f);
    expect((await enviarTextoUltramsg('5511988887777', 'oi', { instancia: 'test', token: 'test' })).ok).toBe(false);
    expect(f).not.toHaveBeenCalled(); expect((await enviarTextoRevisora('Pedido para revisão')).ok).toBe(true);
    expect(new URLSearchParams(f.mock.calls[0]?.[1].body).get('to')).toBe('+5511988887777');
  });
});