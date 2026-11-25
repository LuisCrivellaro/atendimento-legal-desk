import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState, type OfficeState } from '@/lib/office';
import { defaultAutomations } from '@/lib/atendimento';
import {
  LIMITE_LEMBRETES_COLETA, TEXTOS_COLETA, decidirLembretesColeta, expedienteColeta, perguntaAvaliacaoDocumento, preencherColeta,
  registrarLembreteColeta, respostaDocumentoColeta, type EntradaLembretesColeta,
} from '@/lib/atendimento/coleta';
import { enviarLembretesColeta } from '@/lib/atendimento/coleta.server';
import { textosColeta } from '@/lib/respostas-prontas';
import { comItensChecklist } from '@/components/office/attendance-actions';

const mocks = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

// Dados fictícios. 25/11/2026 é quarta-feira; 20/11/2026 é feriado nacional (Consciência Negra).
const SP = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const LINK = 'https://assinatura.exemplo/contrato-ficticio';
const fixture = conversas[1];
if (!fixture) throw new Error('fixture');
const base: Conversa = { ...fixture, id: 'c-col', nome: 'Rogério Fictício Nunes', modoIA: 'Automática', etapa: 'documentos', mensagens: [], timeline: [{ data: '2026-11-20T12:00:00Z', evento: 'Trato feito · pasta X' }], agenteAna: {} };
const entrada = (e: Partial<EntradaLembretesColeta> = {}): EntradaLembretesColeta => ({ emColeta: true, faltantes: [], automacoes: { contrato: true, faltantes: true }, ...e });

describe('regras puras da coleta', () => {
  it('expediente: dia útil das 9h às 17h30, sem feriado nacional', () => {
    expect(expedienteColeta(SP('2026-11-25T10:00'))).toBe(true);
    expect(expedienteColeta(SP('2026-11-25T08:59'))).toBe(false);
    expect(expedienteColeta(SP('2026-11-25T17:31'))).toBe(false);
    expect(expedienteColeta(SP('2026-11-28T10:00'))).toBe(false);
    expect(expedienteColeta(SP('2026-11-20T10:00'))).toBe(false);
  });
  it('contrato: 24 h depois do envio real, no máximo 3 lembretes e depois aviso (D3)', () => {
    const e = entrada({ contrato: 'enviado', contratoLink: LINK, contratoEnviadoEm: SP('2026-11-24T10:00').toISOString() });
    expect(decidirLembretesColeta(e, SP('2026-11-25T09:59'))).toEqual([]);
    const d = decidirLembretesColeta(e, SP('2026-11-25T10:00'));
    expect(d).toEqual([{ tipo: 'contrato', link: LINK, numero: 1 }]);
    let estado = registrarLembreteColeta(undefined, d[0]!, SP('2026-11-25T10:00'));
    expect(decidirLembretesColeta({ ...e, estado }, SP('2026-11-25T16:00'))).toEqual([]);
    estado = registrarLembreteColeta(estado, { tipo: 'contrato', link: LINK, numero: 2 }, SP('2026-11-26T10:00'));
    estado = registrarLembreteColeta(estado, { tipo: 'contrato', link: LINK, numero: 3 }, SP('2026-11-27T10:00'));
    expect(estado.contrato?.enviados).toBe(LIMITE_LEMBRETES_COLETA);
    expect(decidirLembretesColeta({ ...e, estado }, SP('2026-11-30T10:00'))).toEqual([{ tipo: 'limite', pendencia: 'contrato', itens: [] }]);
    const avisado = registrarLembreteColeta(estado, { tipo: 'limite', pendencia: 'contrato', itens: [] }, SP('2026-11-30T10:00'));
    expect(decidirLembretesColeta({ ...e, estado: avisado }, SP('2026-12-01T10:00'))).toEqual([]);
  });
  it('contrato novo (outro link) zera a contagem; contrato sem link ou só registrado sem https não gera lembrete', () => {
    const estado = { contrato: { link: 'https://antigo.exemplo', enviados: 3 } };
    expect(decidirLembretesColeta(entrada({ contrato: 'enviado', contratoLink: LINK, contratoEnviadoEm: SP('2026-11-24T10:00').toISOString(), estado }), SP('2026-11-25T10:00'))[0]).toMatchObject({ tipo: 'contrato', numero: 1 });
    expect(decidirLembretesColeta(entrada({ contrato: 'enviado', contratoEnviadoEm: SP('2026-11-20T10:00').toISOString() }), SP('2026-11-25T10:00'))).toEqual([]);
    expect(decidirLembretesColeta(entrada({ contrato: 'assinado', contratoLink: LINK, contratoEnviadoEm: SP('2026-11-20T10:00').toISOString() }), SP('2026-11-25T10:00'))).toEqual([]);
  });
  it('faltantes: a cada 48 h, só em expediente, limite por item e aviso dos esgotados', () => {
    const e = entrada({ faltantes: ['CPF', 'Comprovante de endereço'], ultimoPedidoDocumentos: SP('2026-11-23T10:00').toISOString() });
    expect(decidirLembretesColeta(e, SP('2026-11-25T09:59'))).toEqual([]);
    expect(decidirLembretesColeta(e, SP('2026-11-25T10:00'))).toEqual([{ tipo: 'faltantes', itens: ['CPF', 'Comprovante de endereço'] }]);
    expect(decidirLembretesColeta(e, SP('2026-11-28T10:00'))).toEqual([]);
    const estado = { itens: { CPF: { enviados: 3 } }, ultimoFaltantesEm: SP('2026-11-23T10:00').toISOString() };
    expect(decidirLembretesColeta({ ...e, estado }, SP('2026-11-25T10:00'))).toEqual([{ tipo: 'limite', pendencia: 'faltantes', itens: ['CPF'] }, { tipo: 'faltantes', itens: ['Comprovante de endereço'] }]);
    expect(decidirLembretesColeta({ ...e, automacoes: { contrato: true, faltantes: false } }, SP('2026-11-25T10:00'))).toEqual([]);
    expect(decidirLembretesColeta({ ...e, emColeta: false }, SP('2026-11-25T10:00'))).toEqual([]);
  });
  it('documento recebido: "recebi" só com recibo; lista faltantes do checklist; avaliação vai para a equipe', () => {
    const r = respostaDocumentoColeta({ temRecibo: true, faltantes: ['CPF', 'Comprovante de endereço'], textoCliente: '' });
    expect(r.mensagem).toBe('Recebi o seu arquivo, obrigada! 😊\nA equipe vai conferir.\n\nAinda faltam:\n• CPF\n• Comprovante de endereço');
    expect(r.humano).toBe(false);
    expect(respostaDocumentoColeta({ temRecibo: true, faltantes: [], textoCliente: '' }).mensagem).toBe(TEXTOS_COLETA.recebidoCompleto.texto);
    const sem = respostaDocumentoColeta({ temRecibo: false, faltantes: ['CPF'], textoCliente: '' });
    expect(sem.mensagem).not.toMatch(/recebi|recebemos/i);
    expect(sem.humano).toBe(true);
    const pergunta = respostaDocumentoColeta({ temRecibo: true, faltantes: [], textoCliente: 'esse documento serve?' });
    expect(pergunta.humano).toBe(true);
    expect(pergunta.mensagem).toMatch(/quem confere se o documento atende é a equipe/);
  });
  it('perguntas de avaliação do documento', () => {
    for (const t of ['esse documento serve?', 'Está certo assim?', 'o que é isso?', 'ficou bom?', 'dá pra ler?']) expect(perguntaAvaliacaoDocumento(t)).toBe(true);
    for (const t of ['segue o RG', 'ok', 'tá bom', 'mandei o comprovante']) expect(perguntaAvaliacaoDocumento(t)).toBe(false);
  });
  it('textos editáveis: versão salva da equipe vence o texto proposto; campos sempre com dado real', () => {
    const t = textosColeta({ itens: [{ id: TEXTOS_COLETA.lembreteContrato.id, titulo: 'x', categoria: 'Documentos', atalho: 'lembrecontrato', texto: 'Olá {nome}, falta assinar: {link}' }], ocultas: [] });
    expect(preencherColeta(t.lembreteContrato, { nome: 'MARIA souza', link: LINK })).toBe(`Olá Maria, falta assinar: ${LINK}`);
    expect(textosColeta().lembreteFaltantes).toBe(TEXTOS_COLETA.lembreteFaltantes.texto);
  });
  it('lista de provas entra no checklist sem duplicar nem desmarcar', () => {
    const docs = [{ nome: 'CPF', recebido: true }];
    expect(comItensChecklist(docs, ['cpf', 'Holerites', 'Holerites', 'Extrato do FGTS'])).toEqual([{ nome: 'CPF', recebido: true }, { nome: 'Holerites', recebido: false }, { nome: 'Extrato do FGTS', recebido: false }]);
  });
});

function criarDb(casos: Record<string, Conversa>, opts: { itens?: { caso_id: string; nome: string; recebido: boolean }[]; contatos?: { conversa_id: string; contato_externo: string }[]; workspace?: OfficeState } = {}) {
  const store = new Map(Object.entries(casos).map(([id, d]) => [id, JSON.parse(JSON.stringify(d)) as Conversa]));
  const audit: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      const f: { col: string; op: string; val: unknown }[] = [];
      let patch: { dados: Conversa } | undefined;
      const exec = (single: boolean) => {
        if (table === 'atendimento_canal_config') return { error: null, data: { canal_ativo: 'ultramsg', agente_ativo: true } };
        if (table === 'atendimento_contatos_teste') return { error: null, data: opts.contatos ?? [...store.keys()].map(id => ({ conversa_id: id, contato_externo: '5511900000002' })) };
        if (table === 'office_workspace') return { error: null, data: single ? { dados: opts.workspace ?? defaultState } : [{ owner_id: 'owner-1', dados: opts.workspace ?? defaultState }] };
        if (table === 'checklist_itens') return { error: null, data: opts.itens ?? [] };
        if (table === 'casos') {
          const id = f.find(x => x.col === 'id' && x.op === 'eq')?.val as string | undefined;
          if (patch && id) { store.set(id, JSON.parse(JSON.stringify(patch.dados)) as Conversa); return { error: null, data: [{ id }] }; }
          if (single && id) return { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(store.get(id))) as Conversa, updated_at: 'rev' } };
          const etapa = f.find(x => x.col === 'etapa')?.val;
          const contrato = f.find(x => x.col === 'dados->>contrato')?.val as string[] | undefined;
          return { error: null, data: [...store].filter(([, d]) => (etapa ? d.etapa === etapa : true) && (contrato ? contrato.includes(d.contrato ?? '') : true)).map(([id2, d]) => ({ id: id2, owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(d)) as Conversa })) };
        }
        return { error: null, data: null };
      };
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { f.push({ col, op: 'eq', val }); return q; },
        in: (col: string, val: unknown) => { f.push({ col, op: 'in', val }); return q; },
        update: (v: { dados: Conversa }) => { patch = v; return q; },
        single: async () => exec(true), maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec(false)).then(res, rej),
      };
      return q;
    },
    rpc: async (_n: string, args: Record<string, unknown>) => { audit.push(args); return { error: null }; },
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: (id = 'c-col') => store.get(id) as Conversa, audit };
}

beforeEach(() => { mocks.enviar.mockReset(); mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-col' }); });

describe('rotina de lembretes de coleta (servidor)', () => {
  const comContrato = { ...base, contrato: 'enviado' as const, contratoLink: LINK, contratoEnviadoEm: SP('2026-11-24T10:00').toISOString() };
  it('envia o lembrete do contrato uma vez por vencimento e grava na conversa', async () => {
    const { db, ler } = criarDb({ 'c-col': comContrato });
    expect(await enviarLembretesColeta(db, SP('2026-11-25T10:00'))).toMatchObject({ enviados: 1 });
    expect(mocks.enviar.mock.calls[0]?.[0]).toMatchObject({ motivo: 'lembreteContrato', contatoEsperado: '5511900000002', texto: `Oi, Rogério! Tudo bem? 😊\nPassando para lembrar que o contrato ainda aguarda a sua assinatura:\n${LINK}\nSe tiver qualquer dificuldade, é só me chamar por aqui.` });
    await enviarLembretesColeta(db, SP('2026-11-25T10:30'));
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(ler().agenteAna?.lembretesColeta?.contrato).toMatchObject({ link: LINK, enviados: 1 });
    expect(ler().timeline.at(-1)?.evento).toBe('Lembrete do contrato enviado pela Anne (1/3)');
  });
  it('fora do expediente não envia', async () => {
    const { db } = criarDb({ 'c-col': comContrato });
    await enviarLembretesColeta(db, SP('2026-11-28T10:00'));
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it('depois de 3 lembretes: aviso à equipe, sem quarto envio', async () => {
    const c = { ...comContrato, agenteAna: { lembretesColeta: { contrato: { link: LINK, enviados: 3, ultimoEm: SP('2026-11-20T10:00').toISOString() } } } };
    const { db, ler } = criarDb({ 'c-col': c });
    expect(await enviarLembretesColeta(db, SP('2026-11-25T10:00'))).toMatchObject({ enviados: 0, avisos: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ler().avisosEquipe?.[0]?.texto).toMatch(/sem assinatura depois de 3 lembretes/);
    await enviarLembretesColeta(db, SP('2026-11-26T10:00'));
    expect(ler().avisosEquipe).toHaveLength(1);
  });
  it('modo Sugerir ou controle humano: aviso com texto pronto, sem envio; Desligada: nada', async () => {
    const sugerir = criarDb({ 'c-col': { ...comContrato, modoIA: 'Sugerir' } });
    await enviarLembretesColeta(sugerir.db, SP('2026-11-25T10:00'));
    expect(sugerir.ler().avisosEquipe?.[0]?.textoPronto).toContain(LINK);
    const humano = criarDb({ 'c-col': { ...comContrato, agenteAna: { humano: true } } });
    await enviarLembretesColeta(humano.db, SP('2026-11-25T10:00'));
    expect(humano.ler().avisosEquipe?.[0]?.texto).toMatch(/conversa com a equipe/);
    const desligada = criarDb({ 'c-col': { ...comContrato, modoIA: 'Desligada' } });
    expect(await enviarLembretesColeta(desligada.db, SP('2026-11-25T10:00'))).toMatchObject({ enviados: 0, avisos: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it('automação desligada pelo dono: nada', async () => {
    const { db } = criarDb({ 'c-col': comContrato }, { workspace: { ...defaultState, automations: { ...defaultAutomations, lembreteContrato: false } } });
    await enviarLembretesColeta(db, SP('2026-11-25T10:00'));
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it('faltantes pelo checklist real; falha do provedor não reenvia e audita', async () => {
    mocks.enviar.mockRejectedValue(new Error('timeout'));
    const c = { ...base, ultimoPedidoDocumentos: SP('2026-11-23T10:00').toISOString() };
    const { db, ler, audit } = criarDb({ 'c-col': c }, { itens: [{ caso_id: 'c-col', nome: 'CPF', recebido: false }, { caso_id: 'c-col', nome: 'RG ou CNH', recebido: true }] });
    expect(await enviarLembretesColeta(db, SP('2026-11-25T10:00'))).toMatchObject({ falhas: 1 });
    expect(mocks.enviar.mock.calls[0]?.[0].texto).toContain('• CPF');
    expect(mocks.enviar.mock.calls[0]?.[0].texto).not.toContain('RG ou CNH');
    await enviarLembretesColeta(db, SP('2026-11-25T10:30'));
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(audit.some(a => a['p_acao'] === 'lembreteColeta' && a['p_status'] === 'erro')).toBe(true);
    expect(ler().agenteAna?.lembretesColeta?.itens?.['CPF']?.enviados).toBe(1);
  });
});
