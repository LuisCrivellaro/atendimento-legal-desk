import { describe, expect, it } from 'vitest';
import { avisoProducao, comDocumentosBase, faseTrato, pastaCliente } from '@/lib/atendimento/trato-feito';

const base = (r: boolean) => ['RG ou CNH', 'CPF', 'Comprovante de endereço', 'E-mail'].map(nome => ({ nome, recebido: r }));
describe('Trato feito', () => {
  it('pasta segue a categoria RT', () => { expect(pastaCliente({ nome: 'Ana', atendimento: 'AT-1', etiquetaAcao: 'RT', mensagens: [] })).toBe('RT - Trabalhista/Ana – AT-1'); });
  it('não duplica documentos já existentes', () => { expect(comDocumentosBase([{ nome: 'CPF', recebido: true }]).filter(d => d.nome === 'CPF')).toHaveLength(1); });
  it('pede base antes do contrato', () => { expect(faseTrato({ documentos: base(false), contrato: 'enviado' })).toBe('documentos_base'); });
  it('sem contrato assinado não avisa Produção', () => { expect(avisoProducao({ nome: 'A', atendimento: 'X', documentos: base(true), contrato: 'enviado' })).toBeUndefined(); });
  it('com tudo juntado avisa a Dra.', () => { expect(avisoProducao({ nome: 'A', atendimento: 'X', documentos: base(true), contrato: 'assinado' })).toContain('Produção'); });
});

import { mensagemTratoFeito as msgTF } from '@/lib/atendimento/trato-feito';
describe('mensagem do TRATO FEITO', () => {
  it('usa o primeiro nome e o texto padrão', () => {
    const m = msgTF('MARIA DA SILVA');
    expect(m.startsWith('Oi, Maria! Tudo bem? 😊')).toBe(true);
    expect(m).toContain('📍 Comprovante de residência atualizado');
    expect(m.endsWith('Equipe CS Advocacia\ncarolinasantos.com.br')).toBe(true);
  });
  it('ignora o prefixo RT/AC do nome exibido', () => {
    expect(msgTF('RT - 00034 - LUIS FILIPE').startsWith('Oi, Luis!')).toBe(true);
  });
});
