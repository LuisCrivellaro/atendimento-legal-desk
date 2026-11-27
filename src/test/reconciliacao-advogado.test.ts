// Correção de 27/11/2026: o relatório das 09h disse ao Fernando que não havia clientes aguardando, com clientes
// aguardando. Aqui: reconciliação de todas as conversas (pura e ponta a ponta) e relatório sem "falso vazio".
// Nenhum disparo real: banco em memória e envio substituído; nenhuma mensagem vai a cliente.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa, type Mensagem } from '@/lib/mock-data';
import { aplicarReconciliacao, avaliarConversaAdvogado } from '@/lib/atendimento/reconciliacao-advogado';
import { encaminhamentoPendente, marcarEncaminhamento, registrarEncaminhamento, relatorioVazioPermitido, textoRelatorioAdvogado } from '@/lib/atendimento/encaminhamento-advogado';
import { reconciliarFilaAdvogado, lerEstadoReconciliacao } from '@/lib/atendimento/reconciliacao-advogado.server';
import { enviarRelatoriosAdvogado, idRelatorio } from '@/lib/atendimento/relatorio-advogado.server';
import { SAUDACAO_CONTATO_ANA } from '@/lib/atendimento/ana-demanda';

const base0 = conversas[0];
if (!base0) throw new Error('Fixture ausente');
const { contrato: _c, ...limpa } = base0;
const TEL = '5511990000001';
const DIA = 86400000;
const AGORA = new Date('2026-11-27T12:00:00Z'); // sexta 09:00 em São Paulo
const t = (msAtras: number) => new Date(AGORA.getTime() - msAtras).toISOString();
const msg = (id: string, de: Mensagem['de'], texto: string, quando: string, extra: Partial<Mensagem> = {}): Mensagem => ({ id, de, texto, canal: 'ultramsg', hora: '', dataHora: quando, ...extra });
const EQUIPE = { autor: 'Fernando' };
const ANNE = { autor: 'Ana · assistente virtual' };
const conversa = (id: string, mensagens: Mensagem[], extra: Partial<Conversa> = {}): Conversa => ({ ...limpa, id, nome: `Cliente ${id}`, telefone: TEL, etapa: 'ativo', processos: [], mensagens, timeline: [], agenteAna: {}, ...extra });
const avaliar = (c: Conversa, situacao = 'ativo', extra: { identificacaoIndisponivel?: boolean } = {}) => avaliarConversaAdvogado(c, { situacao, agora: AGORA, ...extra });
const DADOS = { responsavel: 'Fernando', nomeCliente: 'Marina Fictícia Souza', telefone: TEL, processo: '' };

describe('avaliação da conversa inteira (não só a última mensagem nem só as não lidas)', () => {
  it('pedido anterior à funcionalidade, sem pendência registrada: pendente com a data original', () => {
    const r = avaliar(conversa('a', [msg('1', 'cliente', 'Dra., preciso saber se tenho que ir à audiência', t(2 * DIA))]));
    expect(r).toMatchObject({ tipo: 'pendente', desde: t(2 * DIA), origemId: '1', mensagens: ['1'] });
  });
  it('pendência de vários dias continua; mais de 30 dias vai para conferência', () => {
    expect(avaliar(conversa('a', [msg('1', 'cliente', 'Conseguiram verificar meu caso?', t(6 * DIA))])).tipo).toBe('pendente');
    expect(avaliar(conversa('a', [msg('1', 'cliente', 'Conseguiram verificar meu caso?', t(45 * DIA))])).tipo).toBe('antiga');
  });
  it('só resposta automática da Anne, conversa visualizada, arquivada ou em atendimento humano: continua pendente', () => {
    const msgs = [msg('1', 'cliente', 'Preciso falar com a Dra. Carolina', t(DIA)), msg('2', 'escritorio', SAUDACAO_CONTATO_ANA, t(DIA - 60000), { ...ANNE, respostaAnaDe: '1' }), msg('3', 'escritorio', 'Sua solicitação fica com a equipe responsável pelo atendimento, que responde por aqui.', t(DIA - 120000), ANNE)];
    expect(avaliar(conversa('a', msgs)).tipo).toBe('pendente');
    expect(avaliar(conversa('a', msgs, { lidoAte: t(0), naoLidas: 0 })).tipo).toBe('pendente');
    expect(avaliar({ ...conversa('a', msgs), arquivada: true } as unknown as Conversa).tipo).toBe('pendente');
    expect(avaliar(conversa('a', msgs, { agenteAna: { humano: true } })).tipo).toBe('pendente');
  });
  it('saudação da equipe, promessa de retorno e agradecimento do cliente não resolvem', () => {
    const base = [msg('1', 'cliente', 'A doutora conseguiu ver meu caso?', t(DIA))];
    expect(avaliar(conversa('a', [...base, msg('2', 'escritorio', 'Bom dia, Marina!', t(DIA - 60000), EQUIPE)])).tipo).toBe('pendente');
    expect(avaliar(conversa('a', [...base, msg('2', 'escritorio', 'Vou verificar com a Dra. e te retorno.', t(DIA - 60000), EQUIPE), msg('3', 'cliente', 'obrigada', t(DIA - 90000))])).tipo).toBe('pendente');
  });
  it('cliente efetivamente atendido: resolvida; nova dúvida depois: nova pendência a partir dela', () => {
    const atendido = [msg('1', 'cliente', 'Posso levar testemunha na audiência?', t(3 * DIA)), msg('2', 'escritorio', 'Pode sim, Marina. A testemunha precisa levar documento com foto.', t(3 * DIA - 3600000), EQUIPE)];
    expect(avaliar(conversa('a', atendido)).tipo).toBe('resolvida');
    const nova = avaliar(conversa('a', [...atendido, msg('3', 'cliente', 'E quanto tempo demora a sentença?', t(DIA))]));
    expect(nova).toMatchObject({ tipo: 'pendente', origemId: '3', mensagens: ['3'] });
  });
  it('confirmação explícita da equipe (botão Respondido) resolve; mensagem depois dela reabre', () => {
    const c0 = conversa('a', [msg('1', 'cliente', 'Tenho uma dúvida sobre o acordo', t(2 * DIA))]);
    const reg = registrarEncaminhamento(c0, { conversaId: 'a', mensagemId: '1', texto: 'Tenho uma dúvida sobre o acordo', responsavel: 'Fernando', nomeCliente: '', telefone: TEL, processo: '', aviso: 'fora_horario' }, 'ultramsg', new Date(t(2 * DIA)));
    const marcada = marcarEncaminhamento(reg.conversa, reg.encaminhamento.id, 'respondido', 'Fernando', new Date(t(DIA))).conversa;
    expect(avaliar(marcada).tipo).toBe('resolvida');
    expect(avaliar({ ...marcada, mensagens: [...marcada.mensagens, msg('9', 'cliente', 'Mais uma pergunta: e o FGTS?', t(3600000))] })).toMatchObject({ tipo: 'pendente', origemId: '9' });
  });
  it('várias solicitações sem resposta: uma pendência com todas as mensagens, desde a primeira', () => {
    const r = avaliar(conversa('a', [msg('1', 'cliente', 'Recebi uma intimação', t(2 * DIA)), msg('2', 'cliente', 'Mandei mensagem ontem', t(DIA)), msg('3', 'cliente', '', t(DIA - 1000), { tipo: 'audio', arquivo: 'audio.ogg' })]));
    expect(r).toMatchObject({ tipo: 'pendente', desde: t(2 * DIA), mensagens: ['1', '2', '3'] });
  });
  it('pedidos indiretos são entendidos (sem cadastro ativo confirmado: vão para conferência, não somem)', () => {
    for (const frase of ['A doutora conseguiu ver meu caso?', 'Estou esperando um retorno.', 'Alguma novidade?', 'Conseguiu verificar?', 'Ainda estou aguardando.', 'A Carolina pode me ligar?', 'Mandei mensagem ontem.', 'Vocês conseguiram analisar?', 'Preciso tirar uma dúvida.', 'Quando o advogado vai me responder?'])
      expect(avaliar(conversa('a', [msg('1', 'cliente', frase, t(DIA))]), 'cadastro_anterior').tipo, frase).toBe('ambigua');
  });
  it('agenda, escolha de horário, confirmação e propaganda ficam fora da fila do advogado', () => {
    expect(avaliar(conversa('a', [msg('1', 'cliente', 'quero remarcar minha consulta', t(DIA))])).tipo).toBe('sem_solicitacao');
    expect(avaliar(conversa('a', [msg('0', 'escritorio', 'Tenho estes horários livres na agenda:\n1. sex, 28/11 às 14h', t(DIA + 60000), ANNE), msg('1', 'cliente', '1', t(DIA))])).tipo).toBe('sem_solicitacao');
    expect(avaliar(conversa('a', [msg('1', 'cliente', 'ok', t(DIA))])).tipo).toBe('sem_solicitacao');
    expect(avaliar(conversa('a', [msg('1', 'cliente', 'PROMOÇÃO! Cupom de 50%', t(DIA), { filtroComercial: { resultado: 'comercial', motivos: [], em: t(DIA) } })])).tipo).toBe('sem_solicitacao');
  });
  it('notícia processual: pendente enquanto aguarda revisão; resolvida depois da decisão da Dra.', () => {
    const pergunta = [msg('1', 'cliente', 'Como está meu processo?', t(DIA))];
    expect(avaliar(conversa('a', pergunta)).tipo).toBe('pendente');
    const decidida = conversa('a', pergunta, { agenteAna: { pedidosProcesso: [{ codigo: 'AND-1', conversaId: 'a', contato: { nome: '', telefone: TEL }, identificadoPor: 'telefone', processos: [], textoProposto: '', hash: '', rascunhoPadrao: false, status: 'aprovado', criadoEm: t(DIA), lembretesEm: [], decisao: { por: 'Dra.', canal: 'revisora', em: t(DIA - 3600000) } }] } });
    expect(avaliar(decidida).tipo).toBe('sem_solicitacao');
  });
  it('lead sem vínculo: fora da fila; com retorno prometido pela equipe e não cumprido: conferência', () => {
    expect(avaliar(conversa('a', [msg('1', 'cliente', 'Vocês fazem inventário?', t(DIA))], { etapa: 'inicial' }), 'novo_lead').tipo).toBe('fora_escopo');
    expect(avaliar(conversa('a', [msg('1', 'cliente', 'Preciso de ajuda com um inventário', t(DIA)), msg('2', 'escritorio', 'Vou verificar com a doutora e te retorno', t(DIA - 60000), EQUIPE)], { etapa: 'inicial' }), 'novo_lead').tipo).toBe('ambigua');
  });
});

describe('aplicação na fila: mesma fila, sem duplicar, sem mensagem ao cliente', () => {
  it('cria com data original, aviso "sem_aviso" e id determinístico; rodar de novo não duplica', () => {
    const c = conversa('a', [msg('1', 'cliente', 'Preciso falar com a Dra.', t(3 * DIA))]);
    const r1 = aplicarReconciliacao(c, avaliar(c), DADOS, AGORA)!;
    expect(r1.criada).toBe(true);
    expect(r1.conversa.encaminhamentos).toHaveLength(1);
    expect(r1.conversa.encaminhamentos![0]).toMatchObject({ id: 'encaminhamento:a:1', criadoEm: t(3 * DIA), origem: 'reconciliacao', aviso: { estado: 'sem_aviso' }, status: 'aguardando' });
    expect(r1.conversa.mensagens).toEqual(c.mensagens);
    expect(aplicarReconciliacao(r1.conversa, avaliar(r1.conversa), DADOS, AGORA)).toBeUndefined();
  });
  it('pendência já aberta pela Anne é atualizada (mensagens e data original), nunca duplicada', () => {
    const c0 = conversa('a', [msg('1', 'cliente', 'Tenho uma dúvida', t(2 * DIA)), msg('2', 'cliente', 'Oi', t(DIA))]);
    const anne = registrarEncaminhamento(c0, { conversaId: 'a', mensagemId: '2', texto: 'Oi', responsavel: 'Fernando', nomeCliente: '', telefone: TEL, processo: '', aviso: 'fora_horario' }, 'ultramsg', new Date(t(DIA))).conversa;
    const r = aplicarReconciliacao(anne, avaliar(anne), DADOS, AGORA)!;
    expect(r.criada).toBe(false);
    expect(r.conversa.encaminhamentos).toHaveLength(1);
    expect(r.conversa.encaminhamentos![0]).toMatchObject({ criadoEm: t(2 * DIA), mensagemOrigemId: '1', nomeCliente: 'Marina Fictícia Souza' });
  });
  it('caso ambíguo entra sinalizado para conferência e aparece assim no relatório', () => {
    const c = conversa('a', [msg('1', 'cliente', 'Estou esperando um retorno', t(DIA))]);
    const r = aplicarReconciliacao(c, avaliar(c, 'incerto'), DADOS, AGORA)!;
    expect(r.conversa.encaminhamentos![0]?.conferir).toMatch(/conferir/);
    expect(encaminhamentoPendente(r.conversa)).toBeDefined();
  });
});

describe('relatório: "nenhum cliente" só com verificação completa', () => {
  it('lista vazia só com verificação completa, sem falha e sem conversa não verificada', () => {
    expect(relatorioVazioPermitido([], { completa: true, naoVerificadas: 0 })).toBe(true);
    expect(relatorioVazioPermitido([], { completa: false, naoVerificadas: 0, falha: 'consulta falhou' })).toBe(false);
    expect(relatorioVazioPermitido([], { completa: true, naoVerificadas: 2 })).toBe(false);
    expect(textoRelatorioAdvogado([], AGORA, 'Fernando', { completa: false, naoVerificadas: 0, falha: 'consulta das conversas falhou' }, 'https://app/atendimento'))
      .toBe('Olá, Fernando! ⚠️ Não foi possível validar a lista completa neste horário (consulta das conversas falhou): pode haver outros clientes aguardando. Confira a fila no Manager ADV: https://app/atendimento');
    expect(textoRelatorioAdvogado([], AGORA, 'Fernando', { completa: true, naoVerificadas: 3 })).not.toMatch(/não há clientes aguardando/);
  });
});

// ---------- Banco em memória: conversas, réplica do ProJuris, configuração e estado do monitor ----------
interface Linha { id: string; owner_id: string; dados: Conversa; updated_at: string }
function banco(linhas: Linha[], opcoes: { falharBase?: boolean; falharCasos?: boolean } = {}) {
  const monitor = new Map<string, unknown>();
  const auditoria: Record<string, unknown>[] = [];
  let versao = 0;
  const processoBruto = { codigoProcesso: 1001, processoNumeroWs: '1000001-11.2026.5.02.0001', orgaoJudicial: 'TRT-2', vara: '1ª Vara do Trabalho de São Paulo', assunto: 'Horas extras', segredoJustica: false, processoEnvolvidoSimplificadoWs: [{ codigoPessoa: 101, flagCliente: true }] };
  const carteira = { lista: [{ codigo: 101, nome: 'MARINA FICTÍCIA SOUZA', telefone: TEL, tipo: 'F', cpfCnpj: null, email: null, endereco: null, cidade: null, estado: null, nascimento: null, classificacoes: null, habilitado: true }], processos: { '101': [processoBruto] }, nomes: {}, semData: 0, em: AGORA.toISOString() };
  const db = {
    from(tabela: string) {
      let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'; let campos = ''; let valor: Record<string, unknown> = {};
      const eq: [string, string][] = []; let gt: string | undefined; let limite = Infinity; let comEncaminhamentos = false;
      const exec = () => {
        if (tabela === 'office_workspace') return { data: [], error: null };
        if (tabela === 'projuris_base') return opcoes.falharBase ? { data: null, error: { message: 'indisponível' } } : { data: { carteira }, error: null };
        if (tabela === 'ana_monitoramento') {
          const id = eq.find(f => f[0] === 'id')?.[1] ?? String(valor['id'] ?? '');
          if (op === 'upsert') { monitor.set(String(valor['id']), valor['estado']); return { error: null }; }
          if (op === 'insert') { if (monitor.has(id)) return { error: { message: 'duplicate key' } }; monitor.set(id, valor['estado']); return { error: null }; }
          if (op === 'update') {
            const atual = monitor.get(id) as Record<string, unknown> | undefined;
            if (!atual || !eq.every(([k, v]) => k === 'id' || !k.startsWith('estado->>') || String(atual[k.slice(9)]) === v)) return { data: [], error: null };
            monitor.set(id, valor['estado']); return { data: [{ id }], error: null };
          }
          return { data: monitor.has(id) ? { estado: monitor.get(id) } : null, error: null };
        }
        // casos
        if (op === 'update') {
          const l = linhas.find(x => x.id === eq.find(f => f[0] === 'id')?.[1]);
          if (!l || l.updated_at !== eq.find(f => f[0] === 'updated_at')?.[1]) return { data: [], error: null };
          l.dados = valor['dados'] as Conversa; l.updated_at = `rev-${++versao}`; return { data: [{ id: l.id }], error: null };
        }
        if (opcoes.falharCasos && campos === 'id,owner_id,dados' && !comEncaminhamentos) return { data: null, error: { message: 'timeout' } };
        if (campos.startsWith('telefone:')) return { data: linhas.map(l => ({ telefone: l.dados.telefone })), error: null };
        const porId = eq.find(f => f[0] === 'id')?.[1];
        if (porId) { const l = linhas.find(x => x.id === porId); return { data: l ? { dados: l.dados, updated_at: l.updated_at } : null, error: l ? null : { message: 'não encontrado' } }; }
        let r = [...linhas].sort((a, b) => a.id.localeCompare(b.id));
        if (gt) r = r.filter(l => l.id > gt!);
        if (comEncaminhamentos) r = r.filter(l => (l.dados.encaminhamentos ?? []).length > 0);
        return { data: r.slice(0, limite).map(l => ({ id: l.id, owner_id: l.owner_id, dados: l.dados })), error: null };
      };
      const q = {
        select: (s?: string) => { if (op === 'select') campos = s ?? ''; return q; },
        insert: (v: Record<string, unknown>) => { op = 'insert'; valor = v; return q; },
        update: (v: Record<string, unknown>) => { op = 'update'; valor = v; return q; },
        upsert: (v: Record<string, unknown>) => { op = 'upsert'; valor = v; return q; },
        eq: (k: string, v: unknown) => { eq.push([k, String(v)]); return q; },
        gt: (_k: string, v: string) => { gt = v; return q; },
        not: () => { comEncaminhamentos = true; return q; },
        in: () => q, order: () => q, limit: (n: number) => { limite = n; return q; },
        maybeSingle: async () => exec(), single: async () => exec(),
        then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(exec()).then(ok, erro),
      };
      return q;
    },
    rpc: async (_n: string, args: Record<string, unknown>) => { auditoria.push(args); return { error: null }; },
  } as unknown as SupabaseClient<Database>;
  return { db, monitor, auditoria, linhas };
}
const linha = (id: string, dados: Conversa): Linha => ({ id, owner_id: 'owner', dados, updated_at: 'rev-0' });
const resolvidaDe = (id: string) => linha(id, conversa(id, [msg(`${id}1`, 'cliente', 'Posso levar testemunha?', t(3 * DIA)), msg(`${id}2`, 'escritorio', 'Pode sim. A testemunha precisa levar documento com foto.', t(3 * DIA - 60000), EQUIPE)], { telefone: '5511980000000' }));

describe('regressão do erro de 27/11: relatório vazio com cliente aguardando', () => {
  it('antes: só pendências registradas pela Anne (nenhuma) → "nenhum cliente"; agora: a verificação recupera o cliente e o relatório lista', async () => {
    // Cliente ativo (réplica do ProJuris: Marina, processo 1001) pediu retorno antes da funcionalidade; ninguém respondeu.
    const marina = linha('aaa', conversa('aaa', [msg('m1', 'cliente', 'Bom dia, a Dra. conseguiu ver meu caso? Estou aguardando retorno.', t(2 * DIA)), msg('m2', 'escritorio', SAUDACAO_CONTATO_ANA, t(2 * DIA - 60000), { ...ANNE, respostaAnaDe: 'm1' })], { etapa: 'inicial', nome: 'WhatsApp 5511990000001' }));
    const b = banco([marina, resolvidaDe('bbb')]);
    // Como o relatório antigo via a fila: nenhuma conversa com pendência registrada.
    expect(b.linhas.filter(l => (l.dados.encaminhamentos ?? []).length)).toHaveLength(0);
    const enviar = vi.fn(async (_n: string, _t: string) => ({ ok: true }));
    await enviarRelatoriosAdvogado(b.db, AGORA, { enviar, base: 'https://app' });
    expect(enviar).toHaveBeenCalledTimes(1);
    const texto = String(enviar.mock.calls[0]?.[1]);
    expect(texto).not.toMatch(/não há clientes aguardando/);
    expect(texto).toMatch(/Total de clientes pendentes: 1/);
    expect(texto).toMatch(/👤 Cliente: MARINA FICTÍCIA SOUZA/);
    expect(texto).toMatch(/💬 Solicitação: Bom dia, a Dra\. conseguiu ver meu caso\? Estou aguardando retorno\./);
    expect(texto).toMatch(/📂 Processo: nº 1000001-11\.2026\.5\.02\.0001/);
    expect(texto).toMatch(/🕐 Aguardando desde: 25\/11\/2026 09:00/);
    expect(texto).toMatch(/🔗 Conversa: https:\/\/app\/atendimento\?conversa=aaa/);
    // Fila reconstruída sem mensagem ao cliente (só a do Fernando saiu).
    const p = b.linhas[0]!.dados.encaminhamentos![0]!;
    expect(p).toMatchObject({ origem: 'reconciliacao', aviso: { estado: 'sem_aviso' }, criadoEm: t(2 * DIA) });
    expect(b.linhas[0]!.dados.mensagens).toHaveLength(2);
    expect(enviar.mock.calls.every(c => c[0] === '5511991737442')).toBe(true);
  });
});

describe('reconciliação no monitor: falhas nunca viram lista vazia', () => {
  it('relatório realmente vazio: verificação completa sem pendências → mensagem de nenhum cliente', async () => {
    const b = banco([resolvidaDe('bbb')]);
    const enviar = vi.fn(async (_n: string, _t: string) => ({ ok: true }));
    await enviarRelatoriosAdvogado(b.db, AGORA, { enviar });
    expect(enviar.mock.calls[0]?.[1]).toBe('Olá, Fernando! No momento, não há clientes aguardando retorno. ✅');
  });
  it('falha na consulta do histórico: espera e tenta de novo; no fim da janela avisa que não validou (nunca "nenhum")', async () => {
    const b = banco([resolvidaDe('bbb')], { falharCasos: true });
    const enviar = vi.fn(async (_n: string, _t: string) => ({ ok: true }));
    expect(await enviarRelatoriosAdvogado(b.db, AGORA, { enviar })).toMatchObject({ aguardandoVerificacao: 1 });
    expect(enviar).not.toHaveBeenCalled();
    await enviarRelatoriosAdvogado(b.db, new Date('2026-11-27T13:50:00Z'), { enviar }); // 10:50: faltam 10 min para fechar
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(String(enviar.mock.calls[0]?.[1])).toMatch(/Não foi possível validar a lista completa/);
    expect(String(enviar.mock.calls[0]?.[1])).not.toMatch(/não há clientes aguardando/);
    expect(b.monitor.get(idRelatorio('5511991737442', '2026-11-27', '09:00'))).toMatchObject({ estado: 'enviado', verificacao: 'incompleta' });
  });
  it('falha do ProJuris (réplica indisponível): caso vai para conferência e o relatório avisa conversas não verificadas', async () => {
    const semCadastro = linha('ccc', conversa('ccc', [msg('c1', 'cliente', 'Estou esperando um retorno da doutora', t(DIA))], { etapa: 'inicial', telefone: '5511970000000' }));
    const b = banco([semCadastro], { falharBase: true });
    const enviar = vi.fn(async (_n: string, _t: string) => ({ ok: true }));
    await enviarRelatoriosAdvogado(b.db, AGORA, { enviar });
    const texto = String(enviar.mock.calls[0]?.[1]);
    expect(texto).toMatch(/💬 Solicitação: \(conferir\) Estou esperando um retorno da doutora/);
    expect(texto).toMatch(/não puderam ser verificadas/);
    expect(texto).not.toMatch(/não há clientes aguardando/);
  });
  it('histórico parcialmente carregado: verificação paginada em várias rodadas, relatório só depois de completa', async () => {
    const linhasTeste = Array.from({ length: 6 }, (_, i) => resolvidaDe(`r${i}`));
    linhasTeste.push(linha('zzz', conversa('zzz', [msg('z1', 'cliente', 'Mandei mensagem ontem, alguma novidade?', t(DIA))])));
    const b = banco(linhasTeste);
    let relogio = 0;
    const parcial = await reconciliarFilaAdvogado(b.db, AGORA, { pagina: 2, limiteMs: 1, relogio: () => (relogio += 5) });
    expect(parcial.completa).toBe(false);
    expect((await lerEstadoReconciliacao(b.db)).emAndamento?.cursor).toBeTruthy();
    const enviar = vi.fn(async (_n: string, _t: string) => ({ ok: true }));
    await enviarRelatoriosAdvogado(b.db, AGORA, { enviar });
    expect(String(enviar.mock.calls[0]?.[1])).toMatch(/Total de clientes pendentes: 1/);
    expect((await lerEstadoReconciliacao(b.db)).ultimaCompleta).toMatchObject({ analisadas: 7, ok: true });
  });
  it('às 16h exige verificação nova (a das 09h não serve); duplicatas não acontecem entre rodadas', async () => {
    const b = banco([linha('aaa', conversa('aaa', [msg('m1', 'cliente', 'Preciso falar com a Dra.', t(DIA))]))]);
    const enviar = vi.fn(async (_n: string, _t: string) => ({ ok: true }));
    await enviarRelatoriosAdvogado(b.db, AGORA, { enviar });
    const antes = (await lerEstadoReconciliacao(b.db)).ultimaCompleta?.iniciadaEm;
    const as16 = new Date('2026-11-27T19:00:00Z');
    await enviarRelatoriosAdvogado(b.db, as16, { enviar });
    const depois = (await lerEstadoReconciliacao(b.db)).ultimaCompleta?.iniciadaEm;
    expect(antes).toBe(AGORA.toISOString()); expect(depois).toBe(as16.toISOString());
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(b.linhas[0]!.dados.encaminhamentos).toHaveLength(1);
  });
  it('casos de demonstração (sem mensagem do WhatsApp) nunca entram na fila', async () => {
    const demo = linha('ddd', { ...conversa('ddd', []), mensagens: [{ id: 'd1', de: 'cliente', texto: 'Preciso falar com a Dra. sobre meu processo', hora: '10:00' }] });
    const b = banco([demo]);
    const r = await reconciliarFilaAdvogado(b.db, AGORA);
    expect(r.completa).toBe(true);
    expect(r.resumo).toMatchObject({ analisadas: 1, foraDoWhatsApp: 1, criadas: 0 });
    expect(b.linhas[0]!.dados.encaminhamentos).toBeUndefined();
  });
  it('roda pelo monitor de 5 minutos (servidor, sem Manager aberto): verificação contínua antes do relatório', () => {
    const fonte = readFileSync(path.join(process.cwd(), 'src/lib/atendimento/monitor-operacional.server.ts'), 'utf8');
    const iRec = fonte.indexOf("nome: 'reconciliar-advogado'"), iRel = fonte.indexOf("nome: 'relatorio-advogado'");
    expect(iRec).toBeGreaterThan(0); expect(iRel).toBeGreaterThan(iRec);
  });
});
