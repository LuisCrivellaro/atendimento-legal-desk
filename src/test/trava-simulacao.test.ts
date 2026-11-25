import { describe, it, expect } from 'vitest';
import { simulacaoPermitida } from '@/lib/atendimento/trava-simulacao';
describe('trava de simulação', () => {
  it('bloqueia com UltraMsg ativo', () => expect(simulacaoPermitida('ultramsg')).toBe(false));
  it('bloqueia quando o canal é desconhecido', () => expect(simulacaoPermitida(undefined)).toBe(false));
  it('permite demonstração com canal desligado', () => expect(simulacaoPermitida('desligado')).toBe(true));
});
