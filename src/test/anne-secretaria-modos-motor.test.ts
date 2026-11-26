import { describe, expect, it } from 'vitest';
import type { Conversa } from '@/lib/mock-data';
import { CONFIG_SECRETARIA_PADRAO, lerConfigSecretaria, nivelPermissao, secretariaAtiva } from '@/lib/atendimento/secretaria/config';
import { aoIntervirEquipe, aplicarModo, derivarModoLegado, modoEfetivo, retornoAutomaticoDevido } from '@/lib/atendimento/secretaria/modos';
import { decidirAcao, dentroDaJanela, proximaJanela, type EntradaMotor } from '@/lib/atendimento/secretaria/motor';
import { origemMensagem, ultimaIntervencaoHumana } from '@/lib/atendimento/secretaria/origem';
import { autorizaEnvioAna } from '@/lib/atendimento/ana-execution';

// Dados fictícios: nenhum cliente real.
const AGORA = new Date('2026-11-26T16:14:00Z'); // quinta, 13:14 em São Paulo

function conversa(extra: Partial<Conversa> = {}): Conversa {
  return { id: 'c-teste', nome: 'Cliente Fictício', cpf: '', telefone: '5511999990000', atendimento: 'AT-T', etapa: 'inicial', naoLidas: 0, etapaPipeline: 0, syncs: [], processos: [], documentos: [], mensagens: [], timeline: [], modoIA: 'Automática', ...extra };
}

const ativa = lerConfigSecretaria({ ativa: true });

function entrada(extra: Partial<EntradaMotor> = {}): EntradaMotor {
  return { funcionalidade: 'confirmacao_consulta', config: ativa, ativa: true, modo: 'hibrido', ambiente: { agenteAtivo: true, canalAtivo: true, pausaGlobal: false }, contatoLiberado: true, origem: 'sistema', agora: AGORA, ...extra };
}

describe('configuração da secretaria (feature flag)', () => {
  it('vem desligada por padrão e só liga com true explícito', () => {
    expect(CONFIG_SECRETARIA_PADRAO.ativa).toBe(false);
    expect(lerConfigSecretaria(undefined).ativa).toBe(false);
    expect(lerConfigSecretaria({ ativa: 'true' }).ativa).toBe(false);
    expect(lerConfigSecretaria({ ativa: true }).ativa).toBe(true);
  });
  it('chave mestra do servidor desliga mesmo com a flag ligada', () => {
    expect(secretariaAtiva(ativa, undefined)).toBe(true);
    expect(secretariaAtiva(ativa, '1')).toBe(false);
  });
  it('a configuração não consegue tornar andamento processual automático nem aceitar valores inválidos', () => {
    const c = lerConfigSecretaria({ ativa: true, permissoes: { andamento_processual: 'automatico', followup: 'qualquer' }, janelaPrioridadeHumanaMin: -5, janelaAutomacoes: { inicio: '25:00', fim: '08:00' } });
    expect(nivelPermissao(c, 'andamento_processual')).toBe('aprovacao');
    expect(c.permissoes.followup).toBe('desligado');
    expect(c.janelaPrioridadeHumanaMin).toBe(0);
    expect(c.janelaAutomacoes).toEqual({ inicio: '09:00', fim: '18:00', diasUteis: true });
  });
});

describe('modos por conversa e migração segura', () => {
  it('migra os estados antigos sem reativar conversas desligadas ou pausadas', () => {
    expect(derivarModoLegado(conversa({ modoIA: 'Desligada' }), 'Sugerir')).toBe('bloqueado');
    expect(derivarModoLegado(conversa({ agenteAna: { pausa: true } }), 'Sugerir')).toBe('bloqueado');
    expect(derivarModoLegado(conversa({ modoIA: 'Sugerir' }), 'Automática')).toBe('humano');
    expect(derivarModoLegado(conversa({ agenteAna: { humano: true } }), 'Sugerir')).toBe('hibrido');
    expect(derivarModoLegado(conversa({ agenteAna: { humano: true, erro: 'Falha ao cancelar; conferir agenda.' } }), 'Sugerir')).toBe('humano');
    expect(derivarModoLegado(conversa(), 'Sugerir')).toBe('automatico');
    // Sem modo na conversa, vale o padrão da área de trabalho.
    expect(derivarModoLegado(conversa({ modoIA: undefined }), 'Sugerir')).toBe('humano');
  });

  it('transição para híbrido: equipe assume uma conversa automática', () => {
    const c = aplicarModo(conversa(), 'automatico', { tipo: 'equipe', autor: 'Dra.' }, AGORA);
    expect(modoEfetivo(c, 'Sugerir').modo).toBe('automatico');
    // O fluxo existente grava humano + controleHumanoEm quando a equipe escreve.
    const assumida = { ...c, agenteAna: { ...c.agenteAna, humano: true, controleHumanoEm: '2026-11-26T16:20:00Z' } };
    const calc = modoEfetivo(assumida, 'Sugerir');
    expect(calc.modo).toBe('hibrido');
    expect(calc.motivo).toMatch(/Híbrido/);
    const explicita = aoIntervirEquipe(conversa(), 'Sugerir', AGORA);
    expect(explicita.agenteAna?.secretaria?.modo).toMatchObject({ modo: 'hibrido', definidoPor: 'sistema' });
    expect(explicita.agenteAna?.humano).toBe(true);
  });

  it('nunca sobrescreve Humano ou Bloqueado definidos manualmente', () => {
    for (const modo of ['humano', 'bloqueado'] as const) {
      const c = aplicarModo(conversa(), modo, { tipo: 'equipe' }, AGORA);
      expect(aoIntervirEquipe(c, 'Sugerir', AGORA)).toBe(c);
      expect(modoEfetivo({ ...c, agenteAna: { ...c.agenteAna, humano: true } }, 'Sugerir').modo).toBe(modo);
    }
  });

  it('nunca volta sozinho para Automático; a regra configurada só vale para híbrido vindo da equipe assumindo', () => {
    const assumida = conversa({ agenteAna: { humano: true }, mensagens: [{ id: 'e1', de: 'escritorio', texto: 'Oi, aqui é a equipe', hora: '', dataHora: '2026-11-25T10:00:00Z', autor: 'Dra. Carolina' }] });
    const ultima = ultimaIntervencaoHumana(assumida);
    expect(retornoAutomaticoDevido(assumida, ativa, 'Sugerir', ultima, AGORA)).toBe(false);
    const comRegra = lerConfigSecretaria({ ativa: true, retornoAutomaticoHoras: 24 });
    expect(retornoAutomaticoDevido(assumida, comRegra, 'Sugerir', ultima, AGORA)).toBe(true);
    const manual = aplicarModo(assumida, 'hibrido', { tipo: 'equipe' }, AGORA);
    expect(retornoAutomaticoDevido(manual, comRegra, 'Sugerir', ultima, new Date('2026-11-30T10:00:00Z'))).toBe(false);
  });

  it('aplicar modo grava campos antigos equivalentes e invalida resposta conversacional em andamento', () => {
    const base = conversa({ mensagens: [{ id: 'cli', de: 'cliente', texto: 'Olá', hora: '' }], agenteAna: { controleHumanoEm: 'antes' } });
    expect(autorizaEnvioAna(base, 'cli', 'antes')).toBe(true);
    const h = aplicarModo(base, 'humano', { tipo: 'equipe', autor: 'Equipe' }, AGORA);
    expect(h.modoIA).toBe('Sugerir');
    expect(h.agenteAna).toMatchObject({ humano: true, pausa: false });
    expect(autorizaEnvioAna(h, 'cli', 'antes')).toBe(false);
    const b = aplicarModo(base, 'bloqueado', { tipo: 'equipe' }, AGORA);
    expect(b).toMatchObject({ modoIA: 'Desligada', agenteAna: { humano: true, pausa: true } });
    expect(b.agenteAna?.secretaria?.acoes?.at(-1)?.texto).toMatch(/Bloqueado/);
  });

  it('identifica a origem das mensagens sem confundir pessoa da equipe chamada Ana', () => {
    expect(origemMensagem({ de: 'cliente' })).toBe('cliente');
    expect(origemMensagem({ de: 'escritorio', autor: 'Ana · assistente virtual' })).toBe('automacao');
    expect(origemMensagem({ de: 'escritorio', autor: 'Ana · assistente virtual', respostaAnaDe: 'x' })).toBe('anne');
    expect(origemMensagem({ de: 'escritorio', autor: 'Ana · assistente virtual', respostaAnaDe: 'x', automacaoKey: 'a1' })).toBe('automacao');
    expect(origemMensagem({ de: 'escritorio', autor: 'Ana Paula Souza' })).toBe('equipe');
    expect(origemMensagem({ de: 'escritorio', autor: 'Equipe · celular do escritório' })).toBe('equipe');
  });
});

describe('motor determinístico de decisões', () => {
  it('com a flag desligada nada muda: o fluxo anterior decide', () => {
    expect(decidirAcao(entrada({ ativa: false })).resultado).toBe('ignorar');
  });
  it('atendimento automático normal: conversa liberada só no Automático', () => {
    expect(decidirAcao(entrada({ funcionalidade: 'resposta_conversacional', modo: 'automatico', origem: 'cliente' })).resultado).toBe('executar');
    expect(decidirAcao(entrada({ funcionalidade: 'resposta_conversacional', modo: 'hibrido', origem: 'cliente' }))).toMatchObject({ resultado: 'bloquear', motivo: 'modo_hibrido' });
  });
  it('modos Humano e Bloqueado: nenhuma mensagem automática; sugestão interna só fora do Bloqueado', () => {
    expect(decidirAcao(entrada({ modo: 'humano' }))).toMatchObject({ resultado: 'bloquear', motivo: 'modo_humano', avisarEquipe: true });
    expect(decidirAcao(entrada({ modo: 'bloqueado' }))).toMatchObject({ resultado: 'bloquear', motivo: 'modo_bloqueado' });
    expect(decidirAcao(entrada({ funcionalidade: 'sugestao_interna', modo: 'humano' })).resultado).toBe('executar');
    expect(decidirAcao(entrada({ funcionalidade: 'sugestao_interna', modo: 'bloqueado' })).resultado).toBe('bloquear');
  });
  it('híbrido: automação autorizada sai; resposta só a mensagem de cliente e nunca às próprias', () => {
    expect(decidirAcao(entrada()).resultado).toBe('executar');
    expect(decidirAcao(entrada({ funcionalidade: 'resposta_automacao', origem: 'automacao' })).motivo).toBe('origem_propria');
    expect(decidirAcao(entrada({ funcionalidade: 'resposta_automacao', origem: 'cliente', automacao: { valida: true, candidatas: 1, ultimaDoEscritorio: true } })).resultado).toBe('executar');
  });
  it('mensagens humanas recentes adiam automações; a urgente vira aviso prioritário para a equipe', () => {
    const humana = '2026-11-26T16:00:00Z';
    const adiada = decidirAcao(entrada({ funcionalidade: 'lembrete_coleta', ultimaIntervencaoHumana: humana }));
    expect(adiada).toMatchObject({ resultado: 'adiar', motivo: 'prioridade_humana', adiarAte: '2026-11-26T16:30:00.000Z' });
    expect(decidirAcao(entrada({ ultimaIntervencaoHumana: humana, urgente: true }))).toMatchObject({ resultado: 'encaminhar', motivo: 'prioridade_humana_urgente', avisarEquipe: true, prioridade: true });
    expect(decidirAcao(entrada({ ultimaIntervencaoHumana: '2026-11-26T15:00:00Z' })).resultado).toBe('executar');
  });
  it('permissões da administração: desligado bloqueia, aprovação vira texto pronto', () => {
    expect(decidirAcao(entrada({ funcionalidade: 'followup' }))).toMatchObject({ resultado: 'bloquear', motivo: 'permissao_desligada' });
    expect(decidirAcao(entrada({ funcionalidade: 'cancelamento' }))).toMatchObject({ resultado: 'aprovacao', motivo: 'permissao_aprovacao', avisarEquipe: true });
    expect(decidirAcao(entrada({ funcionalidade: 'andamento_processual', config: lerConfigSecretaria({ ativa: true, permissoes: { andamento_processual: 'automatico' } }) })).resultado).toBe('aprovacao');
  });
  it('prompt injection, pedido jurídico, dados não verificados e pendências vão para a equipe', () => {
    const r = (x: Partial<EntradaMotor>) => decidirAcao(entrada({ funcionalidade: 'resposta_automacao', origem: 'cliente', automacao: { valida: true, candidatas: 1, ultimaDoEscritorio: true }, ...x }));
    expect(r({ injecao: true })).toMatchObject({ resultado: 'encaminhar', motivo: 'possivel_injecao' });
    expect(r({ foraDoEscopo: true })).toMatchObject({ resultado: 'encaminhar', motivo: 'fora_do_escopo' });
    expect(r({ dadosVerificados: false })).toMatchObject({ resultado: 'encaminhar', motivo: 'dados_nao_verificados' });
    expect(r({ pendenciaOperacional: true })).toMatchObject({ resultado: 'encaminhar', motivo: 'pendencia_operacional' });
    expect(r({ automacao: { valida: true, candidatas: 2, ultimaDoEscritorio: true } })).toMatchObject({ resultado: 'encaminhar', motivo: 'ambiguidade' });
    expect(r({ automacao: { valida: true, candidatas: 1, ultimaDoEscritorio: false } })).toMatchObject({ resultado: 'encaminhar', motivo: 'humano_respondeu_depois' });
    expect(r({ jaExecutada: true }).motivo).toBe('duplicada');
  });
  it('pausa global, agente ou canal desligados e contato não liberado bloqueiam antes de tudo', () => {
    expect(decidirAcao(entrada({ ambiente: { agenteAtivo: true, canalAtivo: true, pausaGlobal: true } })).motivo).toBe('pausa_global');
    expect(decidirAcao(entrada({ ambiente: { agenteAtivo: false, canalAtivo: true, pausaGlobal: false } })).motivo).toBe('agente_desligado');
    expect(decidirAcao(entrada({ contatoLiberado: false })).motivo).toBe('contato_nao_liberado');
  });
  it('janela de horário das automações não urgentes', () => {
    const j = CONFIG_SECRETARIA_PADRAO.janelaAutomacoes;
    expect(dentroDaJanela(AGORA, j)).toBe(true);
    const noite = new Date('2026-11-26T23:30:00Z'); // 20:30 SP
    expect(dentroDaJanela(noite, j)).toBe(false);
    expect(proximaJanela(noite, j)).toBe('2026-11-27T12:00:00.000Z');
    expect(proximaJanela(new Date('2026-11-28T15:00:00Z'), j)).toBe('2026-11-30T12:00:00.000Z'); // sábado → segunda 09:00
    expect(decidirAcao(entrada({ funcionalidade: 'lembrete_coleta', agora: noite, respeitaHorario: true }))).toMatchObject({ resultado: 'adiar', motivo: 'fora_do_horario' });
  });
});
