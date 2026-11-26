// Medições antes/depois do Atendimento com dados sintéticos (nenhum dado real). Roda junto da suíte; os números
// variam com a máquina, por isso os limites são folgados e o relatório sai em console (`ATENDIMENTO_MEDICOES`).
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ChatMessages } from '@/components/office/chat-messages';
import { aplicarCaso, buscarNaConversa, comPendentes, mensagensRecentes } from '@/lib/atendimento/sincronizacao';
import { ordenarConversas } from '@/lib/atendimento/conversation-order';
import { enfileirarEnvio, limparFilaEnvio, pendentesAtuais } from '@/lib/atendimento/fila-envio';
import { needsReply } from '@/lib/atendimento';
import type { Conversa, Mensagem } from '@/lib/mock-data';

const TEXTO = 'Bom dia, doutora. Segue o comprovante de residência e a carteira de trabalho que a senhora pediu ontem.';
function conversa(i: number, n: number): Conversa {
  const inicio = Date.UTC(2026, 9, 1) + i * 60000;
  const mensagens: Mensagem[] = Array.from({ length: n }, (_, j) => ({
    id: `ultramsg:55119${String(i).padStart(8, '0')}:${j}`, de: j % 2 ? 'escritorio' : 'cliente', texto: `${TEXTO} (${j})`,
    hora: '10:00', dataHora: new Date(inicio + j * 3600000).toISOString(), canal: 'ultramsg', ...(j % 2 ? { status: 'enviada' as const, autor: 'Equipe' } : {}),
  }));
  return { id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, nome: `Cliente ${i}`, cpf: '', telefone: `55119${String(i).padStart(8, '0')}`, atendimento: `AT-${i}`, etapa: 'inicial', naoLidas: 0, etapaPipeline: 0, syncs: [], processos: [], documentos: [], timeline: [], mensagens, lastMessageAt: mensagens.at(-1)?.dataHora ?? null };
}
const tempo = (f: () => void, vezes = 5) => { const t: number[] = []; for (let i = 0; i < vezes; i++) { const a = performance.now(); f(); t.push(performance.now() - a); } t.sort((a, b) => a - b); return Math.round(t[Math.floor(t.length / 2)]! * 10) / 10; };
const kb = (s: string) => Math.round(new TextEncoder().encode(s).length / 1024);
const relatorio: Record<string, unknown> = {};

afterEach(() => { cleanup(); limparFilaEnvio(); });

describe('medições do Atendimento (300 conversas, uma com 3.000 mensagens)', { timeout: 60000 }, () => {
  const lista = [conversa(0, 3000), ...Array.from({ length: 299 }, (_, i) => conversa(i + 1, 60))].sort(ordenarConversas);
  const linhas = lista.map(c => ({ id: c.id, nome: c.nome, etapa: c.etapa, last_message_at: c.lastMessageAt, dados: c }));
  const corpoLista = JSON.stringify(linhas);
  const corpoUma = JSON.stringify(linhas[5]);

  it('dados: lista inteira a cada 5 s (antes) x só a conversa que mudou (depois)', () => {
    const casos = { listaKB: kb(corpoLista), conversaKB: kb(corpoUma) };
    // Antes, parado na tela: lista a cada 5 s + painel do layout a cada 15 s (todas as mensagens do escritório).
    const antesPorMinuto = casos.listaKB * 12 + casos.listaKB * 4;
    // Depois, parado: varredura do que mudou a cada 60 s (normalmente vazia) + painel a cada 60 s com 30 mensagens/conversa.
    const painel = kb(JSON.stringify(lista.map(c => ({ ...c, mensagens: mensagensRecentes(c.mensagens) }))));
    relatorio['dados'] = { ...casos, painelAntesKB: casos.listaKB, painelDepoisKB: painel, paradoAntesKBporMin: antesPorMinuto, paradoDepoisKBporMin: painel, porMensagemRecebidaAntesKB: casos.listaKB, porMensagemRecebidaDepoisKB: casos.conversaKB };
    expect(casos.conversaKB * 50).toBeLessThan(casos.listaKB);
  });

  it('CPU por mensagem recebida: recarregar e ordenar tudo (antes) x aplicar uma conversa (depois)', () => {
    const antes = tempo(() => { const rows = JSON.parse(corpoLista) as typeof linhas; rows.map(r => ({ ...r.dados, id: r.id })).sort(ordenarConversas); });
    // Antes ainda: a chave da consulta de aprovações levava todos os casos (serializados a cada render, inclusive a cada tecla).
    const chave = tempo(() => { JSON.stringify(['material-approvals', 'u', lista, {}]); });
    const nova = { ...lista[5]!, lastMessageAt: '2028-01-01T00:00:00Z', mensagens: [...lista[5]!.mensagens, { id: 'novo', de: 'cliente' as const, texto: 'oi', hora: '', dataHora: '2028-01-01T00:00:00Z' }] };
    const depois = tempo(() => { JSON.parse(corpoUma); aplicarCaso(lista, nova); });
    relatorio['cpu'] = { recarregarListaMs: antes, chaveAprovacoesPorRenderMs: chave, aplicarUmaConversaMs: depois };
    expect(aplicarCaso(lista, nova)[0]?.id).toBe(nova.id);
    expect(depois).toBeLessThan(antes);
  });

  it('abrir conversa de 3.000 mensagens: tudo (antes) x janela de 80 (depois)', () => {
    const grande = lista.find(c => c.mensagens.length === 3000)!;
    const medir = (janela: number) => { const a = performance.now(); const r = render(<ChatMessages c={grande} userId="u" janela={janela} />); const ms = performance.now() - a; const n = r.container.querySelectorAll('[data-message="true"]').length; cleanup(); return { ms: Math.round(ms), n }; };
    medir(80); // aquece
    const antes = medir(Infinity), depois = medir(80);
    relatorio['abrirConversa'] = { antesMs: antes.ms, balõesAntes: antes.n, depoisMs: depois.ms, balõesDepois: depois.n };
    expect(depois.n).toBe(80);
    expect(antes.n).toBe(3000);
    expect(depois.ms).toBeLessThan(antes.ms);
  }, 60000);

  it('enviar: mensagem otimista na tela antes de qualquer rede', () => {
    const c = lista.find(x => x.mensagens.length === 60)!;
    const r = render(<ChatMessages c={c} userId="u" />);
    const a = performance.now();
    act(() => { enfileirarEnvio({ conversaId: c.id, texto: 'Recebido, obrigado!', autor: 'Equipe' }, () => new Promise(() => {})); });
    r.rerender(<ChatMessages c={comPendentes(c, pendentesAtuais())} userId="u" />);
    const ms = performance.now() - a;
    expect(screen.getByText('Recebido, obrigado!')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Enviando' })).toHaveLength(1);
    relatorio['envioOtimistaMs'] = Math.round(ms * 10) / 10;
    expect(ms).toBeLessThan(500);
  });

  it('busca em nomes e mensagens de 300 conversas (21 mil mensagens)', () => {
    const ms = tempo(() => { lista.filter(c => buscarNaConversa(c, 'carteira de trabalho', c.nome).combina); }, 3);
    // Pior caso: termo inexistente varre todas as mensagens de todas as conversas.
    const pior = tempo(() => { lista.filter(c => buscarNaConversa(c, 'termo inexistente', c.nome).combina); }, 3);
    relatorio['buscaMensagensMs'] = { encontrada: ms, semResultado: pior };
    expect(lista.filter(c => buscarNaConversa(c, 'Cliente 12', c.nome).combina).map(c => c.nome)).toEqual(expect.arrayContaining(['Cliente 12']));
    expect(buscarNaConversa(lista[3]!, 'comprovante', 'x').trecho).toContain('comprovante');
    expect(buscarNaConversa(lista[3]!, 'zzzzzz', 'x').combina).toBe(false);
    // Contador do painel com mensagens recentes = contador com a conversa inteira.
    expect(lista.filter(c => needsReply({ mensagens: mensagensRecentes(c.mensagens) })).length).toBe(lista.filter(needsReply).length);
    console.log('ATENDIMENTO_MEDICOES', JSON.stringify(relatorio));
  });
});
