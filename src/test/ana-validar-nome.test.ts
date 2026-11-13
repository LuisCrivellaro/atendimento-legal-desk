import { describe, it, expect } from 'vitest';
import { validarNome } from '@/lib/atendimento/ana-rules';
describe('validarNome', () => {
  it('"Segunda às 17h" nunca vira nome', () => expect(validarNome('Segunda às 17h')).toBe(''));
  it('"Terça 14" não vira nome', () => expect(validarNome('Terça 14')).toBe(''));
  it('rejeita saudação, e-mail e resposta curta', () => {
    expect(validarNome('Boa tarde')).toBe(''); expect(validarNome('ana@x.com')).toBe(''); expect(validarNome('Maria')).toBe('');
    expect(validarNome('segunda feira')).toBe('');
  });
  it('aceita nome completo', () => {
    expect(validarNome('Maria da Silva')).toBe('Maria da Silva');
    expect(validarNome('meu nome é Vitória Pereira')).toBe('Vitória Pereira');
  });
});
