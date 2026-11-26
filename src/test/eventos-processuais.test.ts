import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { defaultState, type OfficeState } from '@/lib/office';
import { renderizarOficial } from '@/lib/atendimento/biblioteca/renderizar';
import {
  CONFIG_EVENTOS_PADRAO, cancelamentoDoMovimento, decidirLembretesEventos, eventoDoPedidoValido, extrairCampos, instanteEvento,
  registrarEventoCancelado, registrarEventoComunicado, registrarEventoRascunho, tipoDaPericia,
} from '@/lib/atendimento/eventos-processuais';
import { enviarLembretesEventos } from '@/lib/atendimento/eventos-processuais.server';

const mocks = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/atendimento/envio.functions', () => ({ enviarMensagemSistema: mocks.enviar }));

/** Audiências e perícias (dados fictícios; canal simulado). Dezembro/2026: 10 = quinta, 11 = sexta, 13 = domingo, 14 = segunda. */
const SP = (dia: string, hhmm: string) => new Date(`2026-12-${dia}T${hhmm}:00-03:00`);
const base = conversas[0] as Conversa;
const conversa = (extra: Partial<Conversa> = {}): Conversa => ({ ...base, id: 'c-ev', nome: 'Maria Teste', modoIA: 'Automática', mensagens: [], timeline: [], avisosEquipe: [], agenteAna: { dados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' } }, ...extra });
const diaUtil = (d: string) => { const w = new Date(`${d}T12:00:00-03:00`).getUTCDay(); return w !== 0 && w !== 6; };
const pericia = (dia: string) => ({ chave: `900|pericia|${dia}/12/2026|9h`, tipo: 'pericia' as const, codigoProcesso: 900, data: `${dia}/12/2026`, hora: '9h', tipoPericia: 'médica', pedido: 'AND-0007' });
const txt = (r: ReturnType<typeof renderizarOficial>) => (r.ok ? r.texto : '');
const textoT121 = (dia: string) => txt(renderizarOficial('T12.1', { '[data]': `${dia}/12/2026`, '[horário]': '9h', '[endereço completo]': 'Rua Fictícia, 100 — São Paulo/SP' }));
const textoT111 = txt(renderizarOficial('T11.1', { '[nome]': 'Maria', '[data]': '10/12/2026', '[horário]': '14h', '[presencial/online]': 'Presencial', '[tipo de audiência]': 'Instrução', '[número]': '1000000-00.2026.5.02.0001', '[vara responsável]': '1ª Vara do Trabalho', '[Endereço ou link]': 'Av. Fictícia, 200' }));

function comunicada(dia: string, c = conversa()) {
  const r = registrarEventoRascunho(c, pericia(dia), SP('01', '10:00'));
  return registrarEventoComunicado(r, pericia(dia).chave, textoT121(dia), SP('01', '11:00'));
}

describe('eventos processuais (puro)', () => {
  it('cancelamento, tipo da perícia e instante do evento', () => {
    expect(cancelamentoDoMovimento('Audiência CANCELADA por determinação do juízo')).toBe(true);
    expect(cancelamentoDoMovimento('Processo retirado de pauta')).toBe(true);
    expect(cancelamentoDoMovimento('Audiência designada para 10/12/2026 às 14h')).toBe(false);
    expect(tipoDaPericia('Designada perícia médica para 11/12/2026')).toBe('médica');
    expect(tipoDaPericia('Designada perícia para 11/12/2026')).toBeUndefined();
    expect(instanteEvento({ data: '10/12/2026', hora: '14h30' })).toBe(Date.parse('2026-12-10T14:30:00-03:00'));
  });

  it('redesignação invalida o rascunho e os lembretes anteriores; aprovação antiga é recusada', () => {
    const c1 = registrarEventoRascunho(conversa(), pericia('11'), SP('01', '10:00'));
    expect(registrarEventoRascunho(c1, pericia('11'), SP('01', '10:05')).agenteAna?.eventosProcessuais).toHaveLength(1);
    const c2 = registrarEventoRascunho(c1, { ...pericia('18'), pedido: 'AND-0008' }, SP('02', '10:00'));
    expect(c2.agenteAna?.eventosProcessuais?.map(e => e.estado)).toEqual(['redesignado', 'rascunho']);
    expect(eventoDoPedidoValido(c2, pericia('11').chave)).toMatchObject({ ok: false });
    expect(eventoDoPedidoValido(c2, pericia('18').chave)).toEqual({ ok: true });
    expect(c2.avisosEquipe?.some(a => a.prioridade && /redesignada/.test(a.texto))).toBe(true);
  });

  it('cancelamento no ProJuris cancela o evento futuro e para os lembretes', () => {
    const c = registrarEventoCancelado(comunicada('11'), 'pericia', 900, SP('05', '10:00'));
    expect(c.agenteAna?.eventosProcessuais?.[0]?.estado).toBe('cancelado');
    expect(decidirLembretesEventos(c, SP('10', '10:00'), CONFIG_EVENTOS_PADRAO, diaUtil, 'Maria')).toEqual([]);
  });

  it('campos lidos do texto aprovado (estrutura do modelo); texto fora da estrutura não gera campos', () => {
    expect(extrairCampos('T12.1', textoT121('11'))).toEqual({ '[data]': '11/12/2026', '[horário]': '9h', '[endereço completo]': 'Rua Fictícia, 100 — São Paulo/SP' });
    expect(extrairCampos('T12.1', 'Sua perícia é dia 11/12 às 9h na Rua X.')).toBeUndefined();
    expect(comunicada('11').agenteAna?.eventosProcessuais?.[0]).toMatchObject({ estado: 'comunicado', campos: { '[endereço completo]': 'Rua Fictícia, 100 — São Paulo/SP' } });
  });

  it('T12.2 só na véspera, em dia útil e no horário; véspera não útil vira pendência antecipada', () => {
    const c = comunicada('11');
    expect(decidirLembretesEventos(c, SP('10', '08:30'), CONFIG_EVENTOS_PADRAO, diaUtil, 'Maria')).toEqual([]);
    expect(decidirLembretesEventos(c, SP('10', '10:00'), CONFIG_EVENTOS_PADRAO, diaUtil, 'Maria')).toEqual([{ chave: pericia('11').chave, modelo: 'T12.2', valores: { '[tipo de perícia]': 'médica', '[data]': '11/12/2026', '[horário]': '9h', '[endereço completo]': 'Rua Fictícia, 100 — São Paulo/SP' } }]);
    expect(decidirLembretesEventos(c, SP('10', '18:30'), CONFIG_EVENTOS_PADRAO, diaUtil, 'Maria')).toEqual([]);
    const segunda = comunicada('14');
    expect(decidirLembretesEventos(segunda, SP('11', '10:00'), CONFIG_EVENTOS_PADRAO, diaUtil, 'Maria')).toEqual([expect.objectContaining({ id: 'vespera-nao-util', pendencia: expect.stringMatching(/não é dia útil/) })]);
  });

  it('T04 só para audiência presencial, na antecedência configurada; confirmação T11.2 só se a equipe ligar', () => {
    const chave = '901|audiencia|10/12/2026|14h';
    const ev = { chave, tipo: 'audiencia' as const, codigoProcesso: 901, data: '10/12/2026', hora: '14h', pedido: 'AND-0009' };
    const c = registrarEventoComunicado(registrarEventoRascunho(conversa(), ev, SP('01', '10:00')), chave, textoT111, SP('01', '11:00'));
    const acoes = decidirLembretesEventos(c, SP('09', '10:00'), CONFIG_EVENTOS_PADRAO, diaUtil, 'Maria');
    expect(acoes).toEqual([expect.objectContaining({ modelo: 'T04', valores: expect.objectContaining({ '[Endereço completo]': 'Av. Fictícia, 200', '[vara responsável]': '1ª Vara do Trabalho', '[tipo da audiência / modalidade]': 'Instrução / Presencial' }) })]);
    const online = registrarEventoComunicado(registrarEventoRascunho(conversa(), ev, SP('01', '10:00')), chave, textoT111.replace('Presencial', 'Online'), SP('01', '11:00'));
    expect(decidirLembretesEventos(online, SP('09', '10:00'), CONFIG_EVENTOS_PADRAO, diaUtil, 'Maria')).toEqual([]);
    const comConfirmacao = decidirLembretesEventos(c, SP('08', '10:00'), { ...CONFIG_EVENTOS_PADRAO, diasConfirmacaoEvento: 2 }, diaUtil, 'Maria');
    expect(comConfirmacao.map(a => 'modelo' in a ? a.modelo : a.id)).toEqual(['T11.2']);
  });
});

function criarDb(c: Conversa, workspace: OfficeState) {
  let dados = JSON.parse(JSON.stringify(c)) as Conversa;
  let rev = 0;
  const db = {
    from(table: string) {
      let patch: { dados: Conversa } | undefined;
      const exec = (single: boolean) => {
        if (table === 'atendimento_canal_config') return { error: null, data: { canal_ativo: 'ultramsg', agente_ativo: true } };
        if (table === 'atendimento_contatos_teste') return { error: null, data: [{ conversa_id: c.id, contato_externo: '5511900000010' }] };
        if (table === 'office_workspace') return { error: null, data: [{ owner_id: 'owner-1', dados: workspace }] };
        if (table === 'casos') {
          if (patch) { dados = JSON.parse(JSON.stringify(patch.dados)) as Conversa; rev++; return { error: null, data: [{ id: c.id }] }; }
          return single ? { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa, updated_at: String(rev) } } : { error: null, data: [{ id: c.id, owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa }] };
        }
        return { error: null, data: null };
      };
      const q = {
        select: () => q, eq: () => q, in: () => q, not: () => q,
        update: (v: { dados: Conversa }) => { patch = v; return q; },
        single: async () => exec(true), maybeSingle: async () => exec(true),
        then: (res: (v: unknown) => unknown) => Promise.resolve(exec(false)).then(res),
      };
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => dados };
}

beforeEach(() => { mocks.enviar.mockReset(); mocks.enviar.mockResolvedValue({ ok: true, simulado: false, canal: 'ultramsg', idExterno: 'wamid-ev' }); });

describe('rotina de lembretes de eventos (monitor)', () => {
  it('T12.2 aguardando aprovação da Dra.: nada sai; uma pendência com o texto oficial pronto', async () => {
    const { db, ler } = criarDb(comunicada('11'), defaultState);
    expect(await enviarLembretesEventos(db, SP('10', '10:00'))).toMatchObject({ enviados: 0, pendencias: 1 });
    expect(await enviarLembretesEventos(db, SP('10', '10:05'))).toMatchObject({ enviados: 0, pendencias: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(ler().avisosEquipe?.find(a => a.id.startsWith('evento:inativo-T12.2'))?.textoPronto).toContain('Sua perícia de médica será amanhã, 11/12/2026, às 9h.');
  });

  it('T12.2 ativado pela Dra.: sai uma vez na véspera, texto oficial exato, equipe no controle (Híbrido) não impede', async () => {
    const ativo = { ...defaultState, bibliotecaMensagens: { ativacao: { 'T12.2': 'ativo' } } } as OfficeState;
    const { db, ler } = criarDb(comunicada('11', conversa({ agenteAna: { humano: true, dados: { nome: 'Maria Teste', cpf: '', assunto: '', email: '' } } })), ativo);
    expect(await enviarLembretesEventos(db, SP('10', '10:00'))).toMatchObject({ enviados: 1 });
    expect(await enviarLembretesEventos(db, SP('10', '11:00'))).toMatchObject({ enviados: 0 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar.mock.calls[0]?.[0]).toMatchObject({ motivo: 'evento_T12.2', automacaoId: expect.stringMatching(/^evento:T12\.2:/), texto: txt(renderizarOficial('T12.2', { '[tipo de perícia]': 'médica', '[data]': '11/12/2026', '[horário]': '9h', '[endereço completo]': 'Rua Fictícia, 100 — São Paulo/SP' }, { biblioteca: { ativacao: { 'T12.2': 'ativo' } } })) });
    expect(ler().mensagens.at(-1)?.modeloOficial).toEqual({ id: 'T12.2', versao: 1 });
    expect(ler().agenteAna?.humano).toBe(true);
  });

  it('perícia sem tipo no registro: T12.2 não sai (campo sem dado verificado), pendência para a equipe', async () => {
    const ativo = { ...defaultState, bibliotecaMensagens: { ativacao: { 'T12.2': 'ativo' } } } as OfficeState;
    const semTipo = registrarEventoComunicado(registrarEventoRascunho(conversa(), { ...pericia('11'), tipoPericia: undefined }, SP('01', '10:00')), pericia('11').chave, textoT121('11'), SP('01', '11:00'));
    const { db } = criarDb(semTipo, ativo);
    expect(await enviarLembretesEventos(db, SP('10', '10:00'))).toMatchObject({ enviados: 0, pendencias: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('falha do WhatsApp: sem recibo não marca como entregue ao cliente e nunca reenvia', async () => {
    mocks.enviar.mockRejectedValueOnce(new Error('timeout'));
    const ativo = { ...defaultState, bibliotecaMensagens: { ativacao: { 'T12.2': 'ativo' } } } as OfficeState;
    const { db, ler } = criarDb(comunicada('11'), ativo);
    expect(await enviarLembretesEventos(db, SP('10', '10:00'))).toMatchObject({ falhas: 1 });
    await enviarLembretesEventos(db, SP('10', '10:30'));
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(ler().mensagens).toHaveLength(0);
    expect(ler().avisosEquipe?.some(a => a.id.startsWith('evento-falha:T12.2'))).toBe(true);
  });
});

describe('resumo do painel do Atendimento', () => {
  it('lista audiências/perícias futuras, aprovações e documentos pendentes e modelos aguardando a Dra.', async () => {
    const { resumoPainel } = await import('@/lib/atendimento/painel-atendimento');
    const c = { ...comunicada('11'), etapa: 'documentos' as const, documentos: [{ nome: 'CPF', recebido: false }, { nome: 'RG ou CNH', recebido: true }] };
    const r = resumoPainel([{ id: 'c-ev', nome: 'Maria Teste', dados: c }], undefined, SP('05', '10:00'));
    expect(r.eventos).toEqual([{ conversaId: 'c-ev', nome: 'Maria Teste', tipo: 'pericia', data: '11/12/2026', hora: '9h', estado: 'comunicado ao cliente' }]);
    expect(r.documentosPendentes).toEqual({ conversas: 1, itens: 1 });
    expect(r.modelosAguardando.map(m => m.id)).toEqual(['T04', 'T07.2', 'T07.3', 'T11.2', 'T12.2', 'T12.3']);
    expect(resumoPainel([{ id: 'c-ev', nome: 'Maria Teste', dados: c }], { ativacao: { 'T12.2': 'ativo' } }, SP('05', '10:00')).modelosAguardando.map(m => m.id)).not.toContain('T12.2');
    expect(resumoPainel([{ id: 'c-ev', nome: 'Maria Teste', dados: c }], undefined, SP('12', '10:00')).eventos).toEqual([]);
  });
});
