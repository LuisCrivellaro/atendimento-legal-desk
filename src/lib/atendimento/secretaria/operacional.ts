import type { AIMode } from '../../atendimento';
import { newMessage } from '../../atendimento';
import type { Conversa, Mensagem } from '../../mock-data';
import { excessoRespostasAna, podeExecutarAna } from '../ana-execution';
import { hora } from '../ana-scheduling';
import { operacaoExpirada } from '../appointment-management';
import { registrarAviso } from '../avisos-equipe';
import type { ReservaCalendar } from '../calendar-booking';
import { registrarRespostaConfirmacao40 } from '../confirmacao-consulta';
import { nivelPermissao, type ConfigSecretaria, type Funcionalidade } from './config';
import { registrarAcao, type RegistroAcao } from './estado';
import { associarResposta, automacoesAguardandoResposta, automacoesAtivas, automacaoVencida, expirarAutomacoes, novaAutomacao, registrarAutomacao, transicionarAutomacao, type AutomacaoAtiva, type EstadoAutomacao, type RespostaAutomacao, type TipoAutomacao } from './automacoes';
import { decidirAcao, MOTIVOS, type AmbienteMotor, type CodigoMotivo, type DecisaoMotor } from './motor';
import { aplicarModo, modoEfetivo } from './modos';
import { equipeEscreveuDepois, origemMensagem, ultimaIntervencaoHumana, ultimaMensagemEscritorio } from './origem';
import { iniciarReagendamento, passoReagendamento, type AcaoReagendamento, type EstadoReagendamento, type EventoReagendamento } from './reagendamento';
import { pedidoForaDoEscopo, possivelInjecao } from './seguranca';
import { nomeVerificado } from '../biblioteca/selecao';
import type { BibliotecaSalva } from '../biblioteca/renderizar';
import { textoTemplate } from './templates';
import { automacaoSuspensa, type InstrucaoOperacional } from '../instrucoes-operacionais';
import { avisarConsultaSemLink } from '../situacao-consulta';

/**
 * Camada operacional da Anne: respostas dentro de automações ativas no modo Híbrido e reagendamento delegado
 * pela equipe. Separada da camada conversacional (processarAna), sem modelo e sem novo agente.
 * Todos os efeitos passam por portas (banco com CAS, canal, agenda) para poder ser testada sem rede.
 */

export interface PortasAgendaOperacional {
  /** Horários livres verificados na agenda oficial, já filtrados pelas regras; null = agenda indisponível. */
  opcoes: (evitar: string[]) => Promise<string[] | null>;
  /** Um horário específico está livre? null = agenda indisponível. */
  horarioLivre: (iso: string) => Promise<boolean | null>;
  /** Reserva o novo antes de cancelar o antigo e devolve o recibo lido de volta da agenda. */
  remarcar: (atual: ReservaCalendar, novo: string) => Promise<ReservaCalendar>;
}

export interface PortasOperacionais {
  agora: () => Date;
  ler: (conversaId: string) => Promise<Conversa | undefined>;
  /** Escrita com controle de concorrência (CAS por updated_at). */
  atualizar: (conversaId: string, fn: (c: Conversa) => Conversa) => Promise<Conversa>;
  /** Envio pelo canal com a conferência final da camada de envio. Lança erro se não houver recibo. */
  enviar: (p: { conversaId: string; texto: string; automacaoId: string; contatoEsperado: string }) => Promise<{ idExterno?: string | undefined }>;
  agenda?: PortasAgendaOperacional | undefined;
  auditar?: ((acao: string, resumo: string, status: 'sucesso' | 'erro' | 'bloqueado') => Promise<void>) | undefined;
}

export interface ContextoOperacional {
  config: ConfigSecretaria;
  /** Flag da área de trabalho + chave mestra do servidor. */
  ativa: boolean;
  ambiente: AmbienteMotor;
  /** Contato liberado e vinculado a esta conversa (lido no servidor); undefined = não liberado. */
  contato: string | undefined;
  modoPadrao: AIMode;
  canal?: string | undefined;
  /** Versões e ativação da biblioteca oficial salvas pela equipe (06, 08.1 no reagendamento). */
  biblioteca?: BibliotecaSalva | undefined;
  /** Instruções operacionais da equipe (Treinamento de IA), lidas da área de trabalho no servidor. */
  instrucoes?: InstrucaoOperacional[] | undefined;
}

/** `tratada: false` = a camada operacional não agiu e o fluxo conversacional existente segue. */
export interface ResultadoOperacional {
  tratada: boolean;
  motivo: string;
  decisao?: DecisaoMotor | undefined;
  enviada?: boolean | undefined;
}

export const AUTOR_AUTOMACAO = 'Ana · assistente virtual';

/** Falha ou operação de agenda pendente impede automações que mexem na consulta. */
export function pendenciaOperacional(c: Conversa, agora = new Date()) {
  const op = c.agenteAna?.operacaoConsulta;
  return !!c.agenteAna?.erro || (!!op && !operacaoExpirada(op, agora.getTime()));
}

/** A automação ainda se refere à consulta com recibo atual (nunca a uma consulta trocada ou sem recibo). */
export function dadosDaAutomacaoVerificados(c: Conversa, a: AutomacaoAtiva) {
  const reserva = c.agenteAna?.reservaCalendar;
  if (['confirmacao_consulta', 'lembrete_consulta', 'reagendamento', 'cancelamento'].includes(a.tipo)) {
    const inicio = a.referencia.inicio;
    if (!inicio || !reserva || c.consultaAgendada !== inicio || reserva.inicio !== inicio) return false;
    if (a.referencia.eventoId && reserva.id !== a.referencia.eventoId) return false;
  }
  return true;
}

export interface EnvioEsperado {
  automacaoId: string;
  estados: EstadoAutomacao[];
  /** Mensagem do cliente respondida: precisa continuar sendo a última da conversa. */
  mensagemOrigem?: string | undefined;
  /** Revisão do controle humano lida no início: qualquer mudança (equipe escreveu, modo alterado) cancela. */
  controleHumanoEm?: string | undefined;
  desde: string;
}

/**
 * Revalidação imediatamente antes de enviar (também usada pela camada de envio): automação ainda no estado
 * esperado e válida, modo ainda permite, ninguém da equipe escreveu e nenhuma mensagem nova chegou.
 */
export function revalidarEnvioAutomacao(c: Conversa, e: EnvioEsperado, modoPadrao: AIMode, agora = new Date()): { ok: true } | { ok: false; motivo: CodigoMotivo } {
  const a = (c.agenteAna?.secretaria?.automacoes ?? []).find(x => x.id === e.automacaoId);
  if (!a || !e.estados.includes(a.estado) || automacaoVencida(a, agora)) return { ok: false, motivo: 'automacao_invalida' };
  const modo = modoEfetivo(c, modoPadrao).modo;
  if (modo === 'bloqueado') return { ok: false, motivo: 'modo_bloqueado' };
  if (modo === 'humano') return { ok: false, motivo: 'modo_humano' };
  if (c.agenteAna?.controleHumanoEm !== e.controleHumanoEm || equipeEscreveuDepois(c, e.desde)) return { ok: false, motivo: 'humano_respondeu_depois' };
  if (e.mensagemOrigem && c.mensagens.at(-1)?.id !== e.mensagemOrigem) {
    const ultima = c.mensagens.at(-1);
    return { ok: false, motivo: ultima && origemMensagem(ultima) === 'equipe' ? 'humano_respondeu_depois' : 'ambiguidade' };
  }
  return { ok: true };
}

function acao(funcionalidade: Funcionalidade | 'modo', resultado: RegistroAcao['resultado'], motivo: CodigoMotivo, agora: Date, automacaoId?: string, detalhe?: string): RegistroAcao {
  return { id: `${funcionalidade}:${automacaoId ?? 'conversa'}:${agora.toISOString()}:${motivo}`, em: agora.toISOString(), funcionalidade, resultado, motivo, texto: detalhe ? `${MOTIVOS[motivo]} ${detalhe}`.slice(0, 240) : MOTIVOS[motivo], ...(automacaoId ? { automacaoId } : {}) };
}

function comSecretaria(c: Conversa, fn: (s: NonNullable<NonNullable<Conversa['agenteAna']>['secretaria']>) => NonNullable<NonNullable<Conversa['agenteAna']>['secretaria']>): Conversa {
  return { ...c, agenteAna: { ...c.agenteAna, secretaria: fn(c.agenteAna?.secretaria ?? {}) } };
}

export function registrarDecisao(c: Conversa, d: DecisaoMotor, agora: Date, automacaoId?: string, detalhe?: string): Conversa {
  const comAcao = comSecretaria(c, s => ({ ...s, acoes: registrarAcao(s.acoes, acao(d.funcionalidade, d.resultado, d.motivo, agora, automacaoId, detalhe)) }));
  if (!d.avisarEquipe) return comAcao;
  return registrarAviso(comAcao, { id: `secretaria:${d.funcionalidade}:${automacaoId ?? 'conversa'}:${d.motivo}`, tipo: 'coleta', prioridade: d.prioridade, criadoEm: agora.toISOString(), texto: `Anne: ${d.texto}${detalhe ? ` ${detalhe}` : ''}`.slice(0, 300) }, false);
}

/** Reserva o envio (conferida na camada de envio) e marca o eco do WhatsApp como mensagem do sistema. */
function reservarEnvio(c: Conversa, automacaoId: string, texto: string, agora: Date, mensagemOrigem?: string): Conversa {
  const desde = agora.toISOString();
  const controleHumanoEm = c.agenteAna?.controleHumanoEm;
  return {
    ...c,
    agenteAna: {
      ...c.agenteAna,
      envioAna: { mensagemId: `automacao:${automacaoId}`, texto, desde },
      secretaria: { ...c.agenteAna?.secretaria, envio: { automacaoId, texto, desde, ...(mensagemOrigem ? { mensagemOrigem } : {}), ...(controleHumanoEm ? { controleHumanoEm } : {}) } },
    },
  };
}

/** Reserva vale por pouco tempo: depois disso, um envio atrasado nunca sai com contexto velho. */
export const VALIDADE_RESERVA_MS = 2 * 60000;

/**
 * Conferência final na camada de envio (envio.functions.ts), imediatamente antes da chamada ao canal:
 * a reserva desta automação e deste texto existe e é recente, a equipe não escreveu nem mudou o modo depois
 * dela, nenhuma mensagem nova chegou e o modo ainda permite automações.
 */
export function conferirReservaEnvio(c: Conversa, envio: { automacaoId: string; texto: string }, modoPadrao: AIMode, agora = new Date()): { ok: true } | { ok: false; motivo: CodigoMotivo } {
  const r = c.agenteAna?.secretaria?.envio;
  if (!r || r.automacaoId !== envio.automacaoId || r.texto !== envio.texto) return { ok: false, motivo: 'automacao_invalida' };
  const desde = Date.parse(r.desde);
  if (!Number.isFinite(desde) || desde + VALIDADE_RESERVA_MS < agora.getTime()) return { ok: false, motivo: 'automacao_invalida' };
  if (c.agenteAna?.controleHumanoEm !== r.controleHumanoEm || equipeEscreveuDepois(c, r.desde)) return { ok: false, motivo: 'humano_respondeu_depois' };
  if (r.mensagemOrigem && c.mensagens.at(-1)?.id !== r.mensagemOrigem) return { ok: false, motivo: 'ambiguidade' };
  const modo = modoEfetivo(c, modoPadrao).modo;
  if (modo === 'bloqueado') return { ok: false, motivo: 'modo_bloqueado' };
  if (modo === 'humano') return { ok: false, motivo: 'modo_humano' };
  return { ok: true };
}

function registrarEnviada(c: Conversa, automacaoId: string, texto: string, idExterno: string | undefined, agora: Date, canal: string, mensagemOrigem?: string): Conversa {
  const msg: Mensagem = newMessage(texto, { autor: AUTOR_AUTOMACAO, canal, automacaoKey: automacaoId, status: 'enviada', ...(idExterno ? { idExterno } : {}), ...(mensagemOrigem ? { respostaAnaDe: mensagemOrigem } : {}) });
  const s = c.agenteAna?.secretaria;
  return {
    ...c,
    mensagens: [...c.mensagens, { ...msg, dataHora: agora.toISOString() }],
    agenteAna: { ...c.agenteAna, secretaria: { ...s, envio: s?.envio?.automacaoId === automacaoId ? undefined : s?.envio } },
  };
}

/** Efeito de domínio da resposta (fato declarado pelo cliente; nada é cancelado). */
function efeitoRespostaConsulta(c: Conversa, a: AutomacaoAtiva, confirmou: boolean, agora: Date): Conversa {
  const inicio = a.referencia.inicio ?? '';
  if (a.tipo === 'confirmacao_consulta') return registrarRespostaConfirmacao40(c, confirmou ? 'sim' : 'nao', agora);
  const stamp = agora.toISOString();
  const base: Conversa = { ...c, agenteAna: { ...c.agenteAna, confirmacaoCancelamento: undefined, ...(confirmou && c.agenteAna?.lembreteConsulta ? { lembreteConsulta: { ...c.agenteAna.lembreteConsulta, confirmadoEm: stamp } } : {}) }, timeline: [...c.timeline, { data: stamp, evento: confirmou ? 'Cliente confirmou presença pelo lembrete (modo Híbrido)' : 'Cliente respondeu NÃO ao lembrete do dia (modo Híbrido); nada foi cancelado' }] };
  if (confirmou) return base;
  return registrarAviso(base, { id: `lembrete-resposta:${inicio}`, tipo: 'confirmacao40', prioridade: true, criadoEm: stamp, texto: `Cliente respondeu que não vai conseguir comparecer à consulta de hoje às ${hora(inicio)}. Nada foi cancelado; combinar remarcação ou cancelamento.` }, false);
}

interface Execucao {
  p: PortasOperacionais;
  ctx: ContextoOperacional;
  conversaId: string;
  mensagem: Mensagem;
  controle: string | undefined;
  desde: string;
  agora: Date;
  enviou: { valor: boolean };
}

/** Reserva com revalidação, envio e registro. Nunca reenvia depois de falha (o texto pode ter chegado). */
async function enviarComRevalidacao(x: Execucao, automacao: AutomacaoAtiva, texto: string, estados: EstadoAutomacao[], efeito?: (c: Conversa) => Conversa): Promise<{ ok: true; idExterno?: string | undefined } | { ok: false; motivo: CodigoMotivo }> {
  let resultado: { ok: true } | { ok: false; motivo: CodigoMotivo } = { ok: false, motivo: 'automacao_invalida' };
  const origemCliente = x.mensagem.de === 'cliente' ? x.mensagem.id : undefined;
  await x.p.atualizar(x.conversaId, c => {
    const alvo = (c.agenteAna?.secretaria?.automacoes ?? []).find(z => z.id === automacao.id);
    // O efeito (fato dito pelo cliente) vale uma única vez, enquanto a automação ainda espera a resposta.
    const comEfeito = efeito && alvo && estados.includes(alvo.estado) ? efeito(c) : c;
    resultado = revalidarEnvioAutomacao(c, { automacaoId: automacao.id, estados, mensagemOrigem: origemCliente, controleHumanoEm: x.controle, desde: x.desde }, x.ctx.modoPadrao, x.agora);
    if (resultado.ok) return reservarEnvio(comEfeito, automacao.id, texto, x.agora, origemCliente);
    // Barrada na revalidação: a automação passa para a equipe (o efeito nunca é aplicado de novo).
    return efeito && alvo && estados.includes(alvo.estado) ? comSecretaria(comEfeito, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, automacao.id, 'encaminhada', MOTIVOS[(resultado as { motivo: CodigoMotivo }).motivo], x.agora) })) : comEfeito;
  });
  const r = resultado as { ok: true } | { ok: false; motivo: CodigoMotivo };
  if (!r.ok) return r;
  x.enviou.valor = true;
  try {
    const sent = await x.p.enviar({ conversaId: x.conversaId, texto, automacaoId: automacao.id, contatoEsperado: x.ctx.contato ?? '' });
    await x.p.atualizar(x.conversaId, c => registrarEnviada(c, automacao.id, texto, sent.idExterno, x.agora, x.ctx.canal ?? 'ultramsg', origemCliente));
    return { ok: true, idExterno: sent.idExterno };
  } catch (error) {
    const bloqueado = (error as { code?: string })?.code === 'ana_envio_bloqueado';
    // Recusa da conferência final acontece antes da chamada ao provedor: nada saiu.
    if (bloqueado) x.enviou.valor = false;
    await x.p.atualizar(x.conversaId, c => registrarDecisao(
      comSecretaria(c, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, automacao.id, bloqueado ? 'encaminhada' : 'falhou', bloqueado ? 'envio bloqueado na conferência final' : 'envio sem recibo do canal', x.agora), envio: s.envio?.automacaoId === automacao.id ? undefined : s.envio })),
      { resultado: bloqueado ? 'bloquear' : 'encaminhar', funcionalidade: 'resposta_automacao', camada: 'operacional', motivo: bloqueado ? 'humano_respondeu_depois' : 'falha_integracao', texto: MOTIVOS[bloqueado ? 'humano_respondeu_depois' : 'falha_integracao'], avisarEquipe: true, prioridade: !bloqueado },
      x.agora, automacao.id, bloqueado ? undefined : 'Não reenviar sem conferir a conversa.',
    ));
    return { ok: false, motivo: bloqueado ? 'humano_respondeu_depois' : 'falha_integracao' };
  }
}

function entradaMotor(x: Execucao, c: Conversa, funcionalidade: Funcionalidade, modo: ReturnType<typeof modoEfetivo>['modo'], extra: Partial<Parameters<typeof decidirAcao>[0]> = {}) {
  return {
    funcionalidade, config: x.ctx.config, ativa: x.ctx.ativa, modo, ambiente: x.ctx.ambiente, contatoLiberado: !!x.ctx.contato, contato: x.ctx.contato, origem: origemMensagem(x.mensagem),
    agora: x.agora, injecao: possivelInjecao(x.mensagem.texto), foraDoEscopo: pedidoForaDoEscopo(x.mensagem.texto), limiteRespostas: excessoRespostasAna(c, x.agora.getTime()),
    pendenciaOperacional: pendenciaOperacional(c, x.agora), ...extra,
  } satisfies Parameters<typeof decidirAcao>[0];
}

/**
 * "Não vou conseguir" à confirmação ou ao lembrete: registra a resposta (aviso prioritário, nada cancelado) e encerra
 * a automação respondida. Usado no Híbrido (executor) e no Automático (processarAna) antes do reagendamento.
 */
export function registrarNaoComparecimento<T extends Conversa>(c: T, tipo: 'confirmacao_consulta' | 'lembrete_consulta', agora = new Date()): T {
  const inicio = c.consultaAgendada;
  const alvo = automacoesAtivas(c.agenteAna?.secretaria?.automacoes, agora).find(a => a.tipo === tipo && a.referencia.inicio === inicio);
  const fake: AutomacaoAtiva = alvo ?? novaAutomacao({ id: `${tipo}:${inicio}`, tipo, expiraEm: agora.toISOString(), referencia: { inicio }, iniciadaPor: 'rotina' }, agora);
  const comEfeito = efeitoRespostaConsulta(c, fake, false, agora) as T;
  if (!alvo) return comEfeito;
  return comSecretaria(comEfeito, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, alvo.id, 'concluida', 'cliente avisou que não poderá comparecer: reagendamento iniciado', agora, { resultado: 'reagendamento' }) })) as T;
}

async function responderConsulta(x: Execucao, a: AutomacaoAtiva, resposta: RespostaAutomacao): Promise<ResultadoOperacional> {
  const confirmou = resposta.tipo === 'confirmar';
  const inicio = a.referencia.inicio ?? '';
  if (!confirmou) {
    // Não poderá comparecer: registra (nada é cancelado) e a Anne já oferece novos horários reais (reagendamento automático).
    await x.p.atualizar(x.conversaId, c => {
      const alvo = (c.agenteAna?.secretaria?.automacoes ?? []).find(z => z.id === a.id);
      return alvo && alvo.estado === 'aguardando_resposta' ? registrarNaoComparecimento(c, a.tipo as 'confirmacao_consulta' | 'lembrete_consulta', x.agora) : c;
    });
    const r = await iniciarReagendamentoAutomatico(x.p, x.ctx, x.conversaId, 'cliente', 'cliente', { mensagemOrigem: x.mensagem, controle: x.controle });
    if (r.ok) x.enviou.valor = true;
    return { tratada: true, motivo: r.ok ? 'cliente não poderá comparecer: novos horários oferecidos' : `cliente não poderá comparecer; reagendamento não iniciado (${r.motivo}); equipe avisada`, enviada: r.ok };
  }
  // Frase já aprovada no fluxo da Anne ("Presença confirmada! Sua consulta continua hoje, às …"), sem edição.
  const t = textoTemplate('presenca_confirmada', { hora: inicio ? hora(inicio) : undefined });
  if (!t.ok) return { tratada: true, motivo: 'modelo incompleto' };
  const r = await enviarComRevalidacao(x, a, t.texto, ['aguardando_resposta'], c => efeitoRespostaConsulta(c, a, confirmou, x.agora));
  if (!r.ok) {
    // Falha do canal já foi registrada (com aviso) no envio; os demais motivos só entram no histórico.
    if (r.motivo !== 'falha_integracao') await x.p.atualizar(x.conversaId, c => registrarDecisao(c, { resultado: 'encaminhar', funcionalidade: 'resposta_automacao', camada: 'operacional', motivo: r.motivo, texto: MOTIVOS[r.motivo], avisarEquipe: false, prioridade: false }, x.agora, a.id));
    return { tratada: true, motivo: MOTIVOS[r.motivo], enviada: false };
  }
  await x.p.atualizar(x.conversaId, c => comSecretaria(c, s => ({
    ...s,
    automacoes: transicionarAutomacao(s.automacoes, a.id, confirmou ? 'concluida' : 'encaminhada', confirmou ? 'cliente confirmou presença' : 'cliente não poderá comparecer: equipe combina', x.agora, { resultado: confirmou ? 'presença confirmada' : 'equipe avisada' }),
    acoes: registrarAcao(s.acoes, acao('resposta_automacao', 'executada', 'permitido', x.agora, a.id, confirmou ? 'Presença registrada e confirmada ao cliente; atendimento geral continua com a equipe.' : 'Resposta registrada; equipe avisada com prioridade.')),
  })));
  await x.p.auditar?.('secretariaRespostaAutomacao', `${a.tipo} · ${confirmou ? 'confirmada' : 'equipe avisada'}`, 'sucesso');
  return { tratada: true, motivo: confirmou ? 'presença confirmada dentro da automação' : 'resposta registrada e equipe avisada', enviada: true };
}

/** Executa os passos do reagendamento até precisar de nova resposta do cliente. */
async function conduzirReagendamento(x: Execucao, a: AutomacaoAtiva, evento: EventoReagendamento): Promise<ResultadoOperacional> {
  const agenda = x.p.agenda;
  let estado: EstadoReagendamento | undefined = a.etapa;
  if (!estado || !agenda) {
    await x.p.atualizar(x.conversaId, c => registrarDecisao(comSecretaria(c, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, a.id, 'encaminhada', 'reagendamento sem estado ou sem agenda', x.agora) })), { resultado: 'encaminhar', funcionalidade: 'reagendamento', camada: 'operacional', motivo: 'dados_nao_verificados', texto: MOTIVOS.dados_nao_verificados, avisarEquipe: true, prioridade: false }, x.agora, a.id));
    return { tratada: true, motivo: 'reagendamento sem estado' };
  }
  const textos: string[] = [];
  let final: { estado: EstadoAutomacao; motivo: string } | undefined;
  let recibo: ReservaCalendar | undefined;
  let proximo: EventoReagendamento | undefined = evento;
  let avisoEquipe: string | undefined;
  for (let i = 0; proximo && i < 6; i++) {
    const passo: { estado: EstadoReagendamento; acoes: AcaoReagendamento[] } = passoReagendamento(estado, proximo, x.ctx.biblioteca);
    estado = passo.estado;
    proximo = undefined;
    for (const ac of passo.acoes) {
      if (ac.tipo === 'enviar') textos.push(ac.texto);
      else if (ac.tipo === 'consultar_agenda') {
        const opcoes = await agenda.opcoes(ac.evitar).catch(() => null);
        proximo = opcoes === null ? { tipo: 'agenda_falhou' } : { tipo: 'agenda', livres: opcoes, agora: x.agora };
      } else if (ac.tipo === 'consultar_horario') {
        const livre = await agenda.horarioLivre(ac.horario).catch(() => null);
        if (livre === null) { final = { estado: 'encaminhada', motivo: 'agenda indisponível' }; avisoEquipe = 'Agenda indisponível ao conferir o horário pedido no reagendamento.'; }
        else proximo = { tipo: 'disponibilidade', horario: ac.horario, livre };
      } else if (ac.tipo === 'executar') {
        // Conferência final antes de mexer na agenda: modo, automação, ninguém da equipe escreveu, sem operação em curso.
        let liberado = false;
        await x.p.atualizar(x.conversaId, c => {
          const rev = revalidarEnvioAutomacao(c, { automacaoId: a.id, estados: ['aguardando_resposta'], mensagemOrigem: x.mensagem.id, controleHumanoEm: x.controle, desde: x.desde }, x.ctx.modoPadrao, x.agora);
          liberado = rev.ok && !pendenciaOperacional(c, x.agora) && dadosDaAutomacaoVerificados(c, a);
          return liberado ? { ...c, agenteAna: { ...c.agenteAna, operacaoConsulta: { mensagemId: x.mensagem.id, eventoId: ac.de.eventoId, tipo: 'remarcar', desde: x.agora.toISOString() } } } : c;
        });
        if (!liberado) { final = { estado: 'encaminhada', motivo: 'conferência antes da remarcação não passou' }; avisoEquipe = 'Remarcação não executada: a conversa mudou antes da alteração da agenda.'; break; }
        const atual = (await x.p.ler(x.conversaId))?.agenteAna?.reservaCalendar;
        try {
          if (!atual || atual.id !== ac.de.eventoId) throw Object.assign(new Error('Recibo da consulta atual mudou.'), { indisponivel: false });
          recibo = await agenda.remarcar(atual, ac.para);
          proximo = { tipo: 'execucao', ok: true, recibo: { id: recibo.id, inicio: recibo.inicio, ...(recibo.meetUrl ? { meetUrl: recibo.meetUrl } : {}) }, agora: x.agora };
        } catch (error) {
          // Só "horário acabou de ficar ocupado" (conflito na reserva) reoferece; qualquer outra falha vai para a equipe.
          const indisponivel = /acabou de ficar ocupado/i.test((error as Error)?.message ?? '') && (error as { indisponivel?: boolean }).indisponivel !== false;
          proximo = { tipo: 'execucao', ok: false, indisponivel };
        }
        const novo = recibo;
        await x.p.atualizar(x.conversaId, c => {
          const salvo: Conversa = {
            ...c,
            ...(novo ? { consultaAgendada: novo.inicio, horariosOfertados: [] } : {}),
            agenteAna: { ...c.agenteAna, operacaoConsulta: undefined, ...(novo ? { reservaCalendar: novo, alteracaoConsulta: undefined, autorizacaoRemarcacao: undefined, confirmacaoCancelamento: undefined } : {}) },
            ...(novo ? { timeline: [...c.timeline, { data: x.agora.toISOString(), evento: `Consulta remarcada pela Anne (modo Híbrido) com recibo da agenda · ${novo.inicio}` }] } : {}),
          };
          // Novo horário sem link do Meet entregável: aviso prioritário à equipe junto com o recibo.
          return novo ? avisarConsultaSemLink(salvo, novo, x.agora) : salvo;
        });
        if (novo) await x.p.auditar?.('secretariaReagendamento', `Consulta remarcada com recibo · ${novo.inicio}`, 'sucesso');
      } else if (ac.tipo === 'concluir') {
        if (ac.texto) textos.push(ac.texto);
        final = { estado: 'concluida', motivo: ac.mantida ? 'cliente manteve a consulta' : 'remarcação concluída com recibo' };
      } else if (ac.tipo === 'encaminhar') {
        if (ac.texto) textos.push(ac.texto);
        final = { estado: 'encaminhada', motivo: ac.motivo };
        avisoEquipe = `Reagendamento passado à equipe: ${ac.motivo}.`;
      }
    }
  }
  const texto = textos.join('\n\n').trim();
  const estadoFinal = estado;
  // Mensagem só sai com revalidação; se a agenda já mudou e a mensagem foi barrada, a equipe é avisada para informar o cliente.
  const envio = texto ? await enviarComRevalidacao(x, a, texto, ['aguardando_resposta', 'agendada']) : { ok: true as const };
  await x.p.atualizar(x.conversaId, c => {
    let y = comSecretaria(c, s => {
      let lista = (s.automacoes ?? []).map(z => z.id === a.id ? { ...z, etapa: estadoFinal } : z);
      if (envio.ok && 'idExterno' in envio) lista = lista.map(z => z.id === a.id ? { ...z, mensagem: { idExterno: envio.idExterno, texto, enviadaEm: x.agora.toISOString() } } : z);
      if (final) lista = transicionarAutomacao(lista, a.id, final.estado, final.motivo, x.agora, { resultado: final.motivo });
      else if (envio.ok && a.estado === 'agendada') lista = transicionarAutomacao(lista, a.id, 'aguardando_resposta', 'opções enviadas ao cliente', x.agora);
      return { ...s, automacoes: lista, acoes: registrarAcao(s.acoes, acao('reagendamento', final?.estado === 'encaminhada' ? 'encaminhar' : 'executada', final?.estado === 'encaminhada' ? 'dados_nao_verificados' : 'permitido', x.agora, a.id, final?.motivo ?? 'passo do reagendamento')) };
    });
    if (avisoEquipe || (!envio.ok && recibo)) {
      y = registrarAviso(y, { id: `secretaria:reagendamento:${a.id}:${final?.estado ?? 'passo'}`, tipo: 'confirmacao40', prioridade: true, criadoEm: x.agora.toISOString(), texto: (!envio.ok && recibo ? `Consulta remarcada com recibo para ${recibo.inicio}, mas a mensagem ao cliente não saiu (a conversa mudou): avisar o cliente.` : avisoEquipe ?? '').slice(0, 300) }, false);
    }
    return y;
  });
  return { tratada: true, motivo: final?.motivo ?? 'reagendamento em andamento', enviada: !!texto && envio.ok };
}

/**
 * Trata a mensagem do cliente quando a secretaria está ligada e a conversa não está no Automático.
 * Devolve `tratada: false` para o fluxo conversacional existente seguir (modo Automático ou flag desligada).
 */
export async function tratarMensagemOperacional(p: PortasOperacionais, ctx: ContextoOperacional, conversaId: string, mensagemId: string): Promise<ResultadoOperacional> {
  if (!ctx.ativa) return { tratada: false, motivo: MOTIVOS.recurso_desligado };
  const agora = p.agora();
  const c = await p.ler(conversaId);
  const m = c?.mensagens.find(x => x.id === mensagemId);
  if (!c || !m || m.de !== 'cliente') return { tratada: false, motivo: 'mensagem indisponível' };
  const calc = modoEfetivo(c, ctx.modoPadrao);
  if (m.tipo === 'audio') return calc.modo === 'automatico' ? { tratada: false, motivo: 'áudio: fluxo existente' } : { tratada: true, motivo: 'áudio fica com a equipe' };
  if (calc.modo === 'automatico') {
    // No Automático a conversa é da Anne conversacional; só a resposta a um reagendamento em andamento fica aqui.
    const ultima = ultimaMensagemEscritorio(c, ctx.canal ?? 'ultramsg');
    const assoc = associarResposta({ automacoes: c.agenteAna?.secretaria?.automacoes, mensagem: { texto: m.texto, arquivo: m.arquivo }, ultimaDoEscritorio: ultima ? { idExterno: ultima.idExterno, texto: ultima.texto } : undefined, agora });
    if (assoc.tipo !== 'automacao' || assoc.automacao.tipo !== 'reagendamento') return { tratada: false, motivo: 'modo Automático: fluxo conversacional existente' };
  }

  // Claim: webhook repetido, recuperação ou concorrência nunca processam a mesma mensagem duas vezes.
  let claimed = false;
  await p.atualizar(conversaId, x => {
    claimed = false;
    const alvo = x.mensagens.find(y => y.id === mensagemId);
    if (!alvo || !podeExecutarAna(alvo, agora.getTime())) return x;
    claimed = true;
    return {
      ...x,
      mensagens: x.mensagens.map(y => y.id === mensagemId ? { ...y, iaProcessada: true, iaExecucao: { estado: 'executando' as const, tentativas: (y.iaExecucao?.tentativas ?? 0) + 1, desde: agora.toISOString() } } : y),
      agenteAna: { ...x.agenteAna, secretaria: { ...x.agenteAna?.secretaria, automacoes: expirarAutomacoes(x.agenteAna?.secretaria?.automacoes, agora) } },
    };
  });
  if (!claimed) return { tratada: true, motivo: MOTIVOS.duplicada };

  const enviou = { valor: false };
  const concluir = (estado: 'concluida' | 'incerta') => p.atualizar(conversaId, x => ({ ...x, mensagens: x.mensagens.map(y => y.id === mensagemId && y.iaExecucao ? { ...y, iaExecucao: { ...y.iaExecucao, estado } } : y) }));
  try {
    const atual = (await p.ler(conversaId)) ?? c;
    const x: Execucao = { p, ctx, conversaId, mensagem: m, controle: atual.agenteAna?.controleHumanoEm, desde: agora.toISOString(), agora, enviou };
    const r = await tratarReivindicada(x, atual);
    // Envio iniciado sem recibo: resultado incerto (nunca reprocessado nem reenviado automaticamente).
    await concluir(enviou.valor && r.tratada && r.enviada === false ? 'incerta' : 'concluida');
    return r;
  } catch (error) {
    await concluir(enviou.valor ? 'incerta' : 'concluida').catch(() => undefined);
    await p.atualizar(conversaId, x => registrarAviso(x, { id: `secretaria:falha:${mensagemId}`, tipo: 'coleta', prioridade: true, criadoEm: agora.toISOString(), texto: 'Anne: falha ao tratar a resposta dentro de uma automação. Conferir a conversa; nada foi confirmado ao cliente sem recibo.' }, false)).catch(() => undefined);
    await p.auditar?.('secretariaOperacional', 'Falha ao tratar resposta operacional; equipe avisada', 'erro');
    void error;
    return { tratada: true, motivo: MOTIVOS.falha_integracao };
  }
}

async function tratarReivindicada(x: Execucao, c: Conversa): Promise<ResultadoOperacional> {
  const modo = modoEfetivo(c, x.ctx.modoPadrao).modo;
  // Humano: só a equipe envia (sugestões internas são pedidas pela equipe). Bloqueado: nenhuma atuação.
  if (modo === 'humano' || modo === 'bloqueado') return { tratada: true, motivo: modo === 'humano' ? MOTIVOS.modo_humano : MOTIVOS.modo_bloqueado };
  const ultima = ultimaMensagemEscritorio(c, x.ctx.canal ?? 'ultramsg');
  const assoc = associarResposta({ automacoes: c.agenteAna?.secretaria?.automacoes, mensagem: { texto: x.mensagem.texto, arquivo: x.mensagem.arquivo, temRecibo: !!x.mensagem.path && x.mensagem.salvoStart === true }, ultimaDoEscritorio: ultima ? { idExterno: ultima.idExterno, texto: ultima.texto } : undefined, agora: x.agora });
  if (assoc.tipo === 'nenhuma') return { tratada: true, motivo: `Modo Híbrido: ${assoc.motivo}; a equipe conduz.` };
  if (assoc.tipo === 'ambigua') {
    const d = decidirAcao(entradaMotor(x, c, 'resposta_automacao', modo, { automacao: { valida: true, candidatas: assoc.candidatas.length, ultimaDoEscritorio: true } }));
    await x.p.atualizar(x.conversaId, y => registrarDecisao(y, d, x.agora, undefined, `Automações: ${assoc.candidatas.map(a => a.tipo).join(', ')}.`));
    return { tratada: true, motivo: d.texto, decisao: d };
  }
  const a = assoc.automacao;
  const d = decidirAcao(entradaMotor(x, c, 'resposta_automacao', modo, { automacao: { valida: true, candidatas: 1, ultimaDoEscritorio: true }, dadosVerificados: dadosDaAutomacaoVerificados(c, a) }));
  if (d.resultado !== 'executar') {
    await x.p.atualizar(x.conversaId, y => registrarDecisao(d.resultado === 'encaminhar' || d.resultado === 'aprovacao' ? comSecretaria(y, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, a.id, 'encaminhada', d.texto, x.agora) })) : y, d, x.agora, a.id));
    return { tratada: true, motivo: d.texto, decisao: d };
  }
  if (a.tipo === 'confirmacao_consulta' || a.tipo === 'lembrete_consulta') return { ...(await responderConsulta(x, a, assoc.resposta)), decisao: d };
  if (a.tipo === 'reagendamento') {
    if (nivelPermissao(x.ctx.config, 'reagendamento') !== 'automatico') {
      const dr = decidirAcao(entradaMotor(x, c, 'reagendamento', modo, { dadosVerificados: dadosDaAutomacaoVerificados(c, a) }));
      await x.p.atualizar(x.conversaId, y => registrarDecisao(comSecretaria(y, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, a.id, 'encaminhada', dr.texto, x.agora) })), dr, x.agora, a.id));
      return { tratada: true, motivo: dr.texto, decisao: dr };
    }
    return { ...(await conduzirReagendamento(x, a, { tipo: 'mensagem', texto: x.mensagem.texto, agora: x.agora })), decisao: d };
  }
  await x.p.atualizar(x.conversaId, y => registrarDecisao(comSecretaria(y, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, a.id, 'encaminhada', 'sem tratamento automático para este tipo', x.agora) })), { ...d, resultado: 'encaminhar', motivo: 'ambiguidade', texto: MOTIVOS.ambiguidade, avisarEquipe: true }, x.agora, a.id));
  return { tratada: true, motivo: 'tipo de automação sem resposta automática: equipe' };
}

/**
 * Reagendamento automático (Automático ou Híbrido; nunca Humano/Bloqueado): cliente avisou que não poderá comparecer,
 * a equipe registrou a falta ou delegou. Só com consulta com recibo (futura, ou já passada quando é falta registrada),
 * permissão automática, sem outro reagendamento em andamento e sem pendência de agenda. Consulta horários reais,
 * envia o modelo oficial 06 (dois horários hoje) ou a lista aprovada (resposta ao cliente) e aguarda a escolha.
 */
export async function iniciarReagendamentoAutomatico(p: PortasOperacionais, ctx: ContextoOperacional, conversaId: string, origemPedido: 'cliente' | 'ausencia' | 'equipe', quem: string, opcoes: { mensagemOrigem?: Mensagem; controle?: string | undefined } = {}): Promise<{ ok: boolean; motivo: string }> {
  const agora = p.agora();
  if (!ctx.ativa) return { ok: false, motivo: MOTIVOS.recurso_desligado };
  // Instrução operacional vigente suspendendo o reagendamento automático: segue o fluxo anterior (equipe/pergunta).
  const suspensa = automacaoSuspensa(ctx.instrucoes ?? [], 'reagendamento_automatico', agora);
  if (suspensa) return { ok: false, motivo: `Reagendamento automático suspenso pela instrução "${suspensa.titulo}".` };
  const c = await p.ler(conversaId);
  if (!c) return { ok: false, motivo: 'Conversa indisponível.' };
  const modo = modoEfetivo(c, ctx.modoPadrao).modo;
  if (modo === 'humano' || modo === 'bloqueado') return { ok: false, motivo: modo === 'humano' ? MOTIVOS.modo_humano : MOTIVOS.modo_bloqueado };
  const reserva = c.agenteAna?.reservaCalendar;
  if (!reserva || reserva.inicio !== c.consultaAgendada || c.agenteAna?.consultaSuspensa?.inicio === reserva.inicio || (origemPedido !== 'ausencia' && Date.parse(reserva.inicio) <= agora.getTime())) return { ok: false, motivo: MOTIVOS.dados_nao_verificados };
  if (automacoesAtivas(c.agenteAna?.secretaria?.automacoes, agora).some(a => a.tipo === 'reagendamento') || automacoesAguardandoResposta(c.agenteAna?.secretaria?.automacoes, agora).some(a => a.tipo !== 'confirmacao_consulta' && a.tipo !== 'lembrete_consulta')) return { ok: false, motivo: MOTIVOS.ambiguidade };
  const origemMsg: Mensagem = opcoes.mensagemOrigem ?? { id: `equipe:${agora.toISOString()}`, de: 'escritorio', texto: '', hora: '' };
  // Pedido explícito (resposta do cliente, falta registrada ou delegação da equipe): sem espera de prioridade humana.
  const d = decidirAcao({ funcionalidade: 'reagendamento', config: ctx.config, ativa: ctx.ativa, modo, ambiente: ctx.ambiente, contatoLiberado: !!ctx.contato, contato: ctx.contato, origem: origemPedido === 'cliente' ? 'cliente' : 'equipe', agora, pendenciaOperacional: pendenciaOperacional(c, agora), dadosVerificados: true });
  if (d.resultado !== 'executar') {
    await p.atualizar(conversaId, y => registrarDecisao(y, { ...d, avisarEquipe: true }, agora, `reagendamento:${reserva.id}`, origemPedido === 'cliente' ? 'Cliente avisou que não poderá comparecer.' : origemPedido === 'ausencia' ? 'Falta registrada pela equipe.' : undefined));
    return { ok: false, motivo: d.texto };
  }
  const inicio = iniciarReagendamento({ inicio: reserva.inicio, eventoId: reserva.id, nome: nomeVerificado(c), origem: origemPedido });
  const validade = origemPedido === 'ausencia' ? agora.getTime() + 48 * 3600000 : Math.min(Math.max(Date.parse(reserva.inicio), agora.getTime() + 2 * 3600000), agora.getTime() + 48 * 3600000);
  const automacao = novaAutomacao({ id: `reagendamento:${reserva.id}:${agora.getTime()}`, tipo: 'reagendamento', expiraEm: new Date(validade).toISOString(), referencia: { inicio: reserva.inicio, eventoId: reserva.id }, iniciadaPor: origemPedido === 'cliente' ? 'rotina' : 'equipe', etapa: inicio.estado }, agora);
  const detalhe = origemPedido === 'cliente' ? 'Cliente avisou que não poderá comparecer.' : origemPedido === 'ausencia' ? `Falta registrada por ${quem.slice(0, 60)}.` : `Delegado por ${quem.slice(0, 60)}.`;
  const salvo = await p.atualizar(conversaId, x => comSecretaria(x, s => ({ ...s, automacoes: registrarAutomacao(s.automacoes, automacao), acoes: registrarAcao(s.acoes, acao('reagendamento', 'executada', 'permitido', agora, automacao.id, detalhe)) })));
  const x: Execucao = { p, ctx, conversaId, mensagem: origemMsg, controle: opcoes.controle ?? salvo.agenteAna?.controleHumanoEm, desde: agora.toISOString(), agora, enviou: { valor: false } };
  const primeiro = inicio.acoes[0];
  if (!primeiro || primeiro.tipo !== 'consultar_agenda' || !p.agenda) return { ok: false, motivo: MOTIVOS.dados_nao_verificados };
  const livres = await p.agenda.opcoes(primeiro.evitar).catch(() => null);
  const r = await conduzirReagendamento(x, automacao, livres === null ? { tipo: 'agenda_falhou' } : { tipo: 'agenda', livres, agora });
  // Opções enviadas: o aviso "cliente não vai conseguir" deixa de pedir ação da equipe (fica no histórico como resolvido).
  // Sem envio, o aviso prioritário continua aberto, junto com o motivo do bloqueio.
  if (r.enviada) {
    const ids = [`confirmacao40-resposta:${reserva.inicio}`, `lembrete-resposta:${reserva.inicio}`];
    await p.atualizar(conversaId, y => ({ ...y, avisosEquipe: (y.avisosEquipe ?? []).map(av => ids.includes(av.id) && !av.resolvidoEm ? { ...av, resolvidoEm: agora.toISOString(), resolvidoPor: 'Anne · novos horários oferecidos' } : av) }));
  }
  return { ok: !!r.enviada, motivo: r.motivo };
}

/** A equipe delega à Anne o reagendamento (botão "Anne remarca a consulta"). */
export async function iniciarReagendamentoDelegado(p: PortasOperacionais, ctx: ContextoOperacional, conversaId: string, quem: string): Promise<{ ok: boolean; motivo: string }> {
  return iniciarReagendamentoAutomatico(p, ctx, conversaId, 'equipe', quem);
}

/**
 * Camada conversacional (modo Automático) com a secretaria ligada: resposta com dado não verificado não sai.
 * Fica retida como rascunho para a equipe revisar, com aviso e registro do motivo (sem os dados por extenso).
 */
export function reterRespostaNaoVerificada(c: Conversa, texto: string, faltando: string[], mensagemId: string, agora = new Date()): Conversa {
  const retida: Conversa = { ...c, iaRetida: texto, mensagens: c.mensagens.map(m => m.id === mensagemId && m.iaExecucao ? { ...m, iaExecucao: { ...m.iaExecucao, estado: 'concluida' as const } } : m) };
  return registrarDecisao(retida, { resultado: 'aprovacao', funcionalidade: 'resposta_conversacional', camada: 'conversacional', motivo: 'dados_nao_verificados', texto: MOTIVOS.dados_nao_verificados, avisarEquipe: true, prioridade: false }, agora, undefined, `Resposta da Anne retida para revisão (${faltando.slice(0, 4).join(', ')}).`);
}

/** Mensagem com instruções dirigidas à IA no modo Automático: sem chamada ao modelo; passa para a equipe (Híbrido). */
export function encaminharInjecao(c: Conversa, mensagemId: string, modoPadrao: AIMode, agora = new Date()): Conversa {
  const base: Conversa = { ...c, mensagens: c.mensagens.map(m => m.id === mensagemId && m.iaExecucao ? { ...m, iaExecucao: { ...m.iaExecucao, estado: 'concluida' as const } } : m) };
  const comModo = modoEfetivo(base, modoPadrao).modo === 'automatico' ? aplicarModo(base, 'hibrido', { tipo: 'sistema', autor: 'regra' }, agora, 'mensagem com instruções dirigidas à IA') : base;
  return registrarDecisao(comModo, { resultado: 'encaminhar', funcionalidade: 'resposta_conversacional', camada: 'conversacional', motivo: 'possivel_injecao', texto: MOTIVOS.possivel_injecao, avisarEquipe: true, prioridade: false }, agora, `injecao:${mensagemId}`);
}

/** Resposta tratada pelo fluxo existente (modo Automático): encerra a automação correspondente. */
export function encerrarAutomacaoRespondida(c: Conversa, tipo: TipoAutomacao, resposta: 'sim' | 'nao', agora = new Date()): Conversa {
  const inicio = c.consultaAgendada;
  const alvo = automacoesAtivas(c.agenteAna?.secretaria?.automacoes, agora).find(a => a.tipo === tipo && a.referencia.inicio === inicio);
  if (!alvo) return c;
  return comSecretaria(c, s => ({ ...s, automacoes: transicionarAutomacao(s.automacoes, alvo.id, resposta === 'sim' ? 'concluida' : 'encaminhada', resposta === 'sim' ? 'cliente confirmou (fluxo Automático)' : 'cliente não poderá comparecer (fluxo Automático)', agora) }));
}

/** Registra a automação proativa já enviada (confirmação, lembrete...) para associar a resposta do cliente depois. */
export function registrarAutomacaoEnviada(c: Conversa, dados: { tipo: TipoAutomacao; id: string; referencia: AutomacaoAtiva['referencia']; expiraEm: string; idExterno?: string | undefined; texto: string }, agora = new Date()): Conversa {
  const a = novaAutomacao({ id: dados.id, tipo: dados.tipo, expiraEm: dados.expiraEm, referencia: dados.referencia, iniciadaPor: 'rotina', estado: 'aguardando_resposta', mensagem: { ...(dados.idExterno ? { idExterno: dados.idExterno } : {}), texto: dados.texto, enviadaEm: agora.toISOString() } }, agora);
  return comSecretaria(c, s => ({ ...s, automacoes: registrarAutomacao(s.automacoes, a), acoes: registrarAcao(s.acoes, acao(dados.tipo === 'confirmacao_consulta' ? 'confirmacao_consulta' : dados.tipo === 'lembrete_consulta' ? 'lembrete_consulta' : 'mensagem_programada', 'executada', 'permitido', agora, a.id, 'Mensagem enviada com recibo do canal.')) }));
}

/** Decisão do motor para uma rotina do servidor a partir do JSON da conversa (sem efeitos). */
export function decisaoRotina(c: Conversa, ctx: ContextoOperacional, funcionalidade: Funcionalidade, opcoes: { agora: Date; urgente?: boolean; dadosVerificados?: boolean; jaExecutada?: boolean; respeitaHorario?: boolean }): DecisaoMotor {
  return decidirAcao({
    funcionalidade, config: ctx.config, ativa: ctx.ativa, modo: modoEfetivo(c, ctx.modoPadrao).modo, ambiente: ctx.ambiente, contatoLiberado: !!ctx.contato, contato: ctx.contato, origem: 'sistema', agora: opcoes.agora,
    ultimaIntervencaoHumana: ultimaIntervencaoHumana(c), urgente: opcoes.urgente, jaExecutada: opcoes.jaExecutada, pendenciaOperacional: pendenciaOperacional(c, opcoes.agora),
    dadosVerificados: opcoes.dadosVerificados, respeitaHorario: opcoes.respeitaHorario,
  });
}
