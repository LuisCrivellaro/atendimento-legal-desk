// Lista única de conversas no Atendimento (pedido de 27/11/2026, referência: WhatsApp Business Web).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarCaso } from '@/lib/atendimento/sincronizacao';
import { ordenarConversas } from '@/lib/atendimento/conversation-order';
import type { Conversa, Mensagem } from '@/lib/mock-data';

const tela = readFileSync(path.resolve(__dirname, '../routes/_authenticated/atendimento.tsx'), 'utf8');
const conversa = (i: number, ultima: string, de: Mensagem['de'] = 'cliente'): Conversa => ({
  id: `c${i}`, nome: `Cliente ${i}`, cpf: '', telefone: `5511900000${String(i).padStart(3, '0')}`, atendimento: '', etapa: 'inicial', naoLidas: 0, etapaPipeline: 0,
  syncs: [], processos: [], documentos: [], timeline: [], lastMessageAt: ultima,
  mensagens: [{ id: `m${i}`, de, texto: 'oi', hora: '', dataHora: ultima, canal: 'ultramsg' }],
});

describe('Atendimento: lista única', () => {
  it('sem as abas "Aguardando", do advogado e "Todas" e sem a chamada central de próximo atendimento', () => {
    expect(tela).not.toMatch(/role="tablist"/);
    expect(tela).not.toContain("['aguardando','Aguardando']");
    expect(tela).not.toContain('conversas aguardam resposta');
    expect(tela).toContain('Selecione uma conversa para começar');
  });

  it('etapa, etiqueta e responsável ficam no botão de filtros; a fila do advogado continua existindo', () => {
    for (const rotulo of ['aria-label="Filtrar etapa"', 'aria-label="Filtrar etiqueta"', 'aria-label="Filtrar responsável"', 'Limpar filtros']) expect(tela).toContain(rotulo);
    expect(tela).toContain('encaminhamentoPendente(c)');
    expect(tela).toMatch(/respFilter==='advogado'&&!naFila\.has\(c\.id\)/);
    // A lista visível parte de todas as conversas (sem a fila "Aguardando" como base).
    expect(tela).toMatch(/const visible=list\.filter\(/);
  });

  it('ordem pela última mensagem e a conversa sobe ao receber ou enviar mensagem', () => {
    let lista = [conversa(1, '2026-11-27T10:00:00Z'), conversa(2, '2026-11-27T11:00:00Z'), conversa(3, '2026-11-27T09:00:00Z')].sort(ordenarConversas);
    expect(lista.map(c => c.id)).toEqual(['c2', 'c1', 'c3']);
    lista = aplicarCaso(lista, conversa(3, '2026-11-27T12:00:00Z', 'cliente'));
    expect(lista.map(c => c.id)).toEqual(['c3', 'c2', 'c1']);
    lista = aplicarCaso(lista, conversa(1, '2026-11-27T12:30:00Z', 'escritorio'));
    expect(lista.map(c => c.id)).toEqual(['c1', 'c3', 'c2']);
  });
});
