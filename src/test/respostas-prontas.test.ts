import { describe, it, expect } from 'vitest';
import { conversas } from '@/lib/mock-data';
import { DEFAULT_REPLIES, emptySaved, fillReply, mergeReplies, pendingFields, removeReply, restoreDefault, searchReplies, suggestedReplies, upsertReply, validateReply, cleanShortcut } from '@/lib/respostas-prontas';

const mariana = conversas[0]!;
const rogerio = conversas[1]!;
const helena = conversas[2]!;

describe('Mensagens prontas', () => {
  it('preenche nome, faltantes e atendimento, mantendo campos livres', () => {
    const t = fillReply('Olá, {nome} ({nome_completo}, {atendimento}). Faltam: {documentos_faltantes}. Data: {data}', mariana);
    expect(t).toBe('Olá, Mariana (Mariana Albuquerque Teixeira, AT-2026-0418). Faltam: Carteira de trabalho (CTPS), Laudos médicos. Data: {data}');
    expect(fillReply('{documentos_faltantes}', helena)).toBe('nenhum documento pendente');
  });

  it('aponta campos que ainda precisam ser preenchidos', () => {
    expect(pendingFields('Sua perícia será em {data} às {hora}. {data}')).toEqual(['data', 'hora']);
    expect(pendingFields('Sem campos')).toEqual([]);
  });

  it('sugere por etapa e prioriza documento recebido', () => {
    const all = mergeReplies();
    expect(suggestedReplies(rogerio, all).map((r) => r.id)).toEqual(['ola', 'entender', 'cs-boas-vindas', 'cs-docs-contrato']);
    const comArquivo = { ...mariana, mensagens: [...mariana.mensagens, { id: 'x', de: 'cliente' as const, texto: '', arquivo: 'ctps.pdf', hora: '' }] };
    expect(suggestedReplies(comArquivo, all)[0]?.id).toBe('recebido');
    expect(suggestedReplies(helena, all).map((r) => r.id)).toContain('andamento');
  });

  it('não sugere lembrar faltantes quando a checklist está completa', () => {
    const completa = { ...mariana, documentos: mariana.documentos.map((d) => ({ ...d, recebido: true })) };
    expect(suggestedReplies(completa, mergeReplies()).some((r) => r.id === 'faltam')).toBe(false);
  });

  it('busca por atalho, título e texto, sem acentos', () => {
    const all = mergeReplies();
    expect(searchReplies(all, '/ola')[0]?.id).toBe('ola');
    expect(searchReplies(all, 'saudacao')[0]?.id).toBe('ola');
    expect(searchReplies(all, 'ilumina').map((r) => r.id)).toEqual(['foto']);
    expect(searchReplies(all, '')).toHaveLength(all.length);
  });

  it('cria, edita, oculta e restaura mensagens', () => {
    const nova = { id: 'n1', titulo: 'Perícia', texto: '{nome}, sua perícia será em {data}.', categoria: 'Processo' as const, atalho: 'pericia' };
    let saved = upsertReply(emptySaved, nova);
    expect(mergeReplies(saved).some((r) => r.id === 'n1')).toBe(true);
    saved = upsertReply(saved, { ...DEFAULT_REPLIES[0]!, texto: 'Bom dia, {nome}!' });
    expect(mergeReplies(saved).find((r) => r.id === 'ola')?.texto).toBe('Bom dia, {nome}!');
    saved = restoreDefault(saved, 'ola');
    expect(mergeReplies(saved).find((r) => r.id === 'ola')?.texto).toBe(DEFAULT_REPLIES[0]!.texto);
    saved = removeReply(saved, 'ola');
    expect(mergeReplies(saved).some((r) => r.id === 'ola')).toBe(false);
    saved = removeReply(saved, 'n1');
    expect(saved.itens).toHaveLength(0);
  });

  it('valida nome, texto e atalho único', () => {
    const all = mergeReplies();
    expect(validateReply({ id: 'x', titulo: '', texto: '', atalho: '' }, all)).toHaveLength(3);
    expect(validateReply({ id: 'x', titulo: 'A', texto: 'B', atalho: 'ola' }, all)).toEqual(['O atalho /ola já está em uso.']);
    expect(validateReply({ id: 'ola', titulo: 'A', texto: 'B', atalho: 'ola' }, all)).toEqual([]);
    expect(cleanShortcut('/Bom Diá!')).toBe('bomdia');
  });
});
