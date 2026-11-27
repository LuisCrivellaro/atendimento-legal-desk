import type { Conversa, Mensagem } from '../mock-data';
import { identificacaoProcesso, type ProcessoPJ } from '../projuris/processos';
import { historicoContato } from './ana-contexto';
import { apenasSaudacaoAna } from './ana-demanda';
import { escolherHorarioAna, pedidoHorarioEspecifico, pedidoHumano, pedidoOutrasOpcoesAna } from './ana-scheduling';
import { emColeta, perguntaAvaliacaoDocumento } from './coleta';
import { confirmacao40Respondivel, respostaConfirmacao40 } from './confirmacao-consulta';
import { pedidoNoticiaProcesso, respostaDuranteEspera } from './consulta-processo';
import { lembreteAtivo, respostaLembreteAna } from './lembrete-consulta';
import { automacoesAguardandoResposta } from './secretaria/automacoes';
import { origemMensagem } from './secretaria/origem';
import { EXPEDIENTE_RELATORIO } from './secretaria/encaminhamento-config';
import { feriadoNacional } from './schedule-rules';

/**
 * Encaminhamento de clientes ativos ao advogado responsável (Fernando), pedido da Dra. Carolina em 26/11/2026.
 * - Cliente ativo com dúvida, solicitação, questão jurídica ou pedido para falar com a Dra.: a Anne envia a mensagem
 *   fixa abaixo (nunca gerada por IA) e registra uma pendência para o advogado, sem perguntar se é nova demanda.
 * - Enquanto a pendência estiver aberta, a Anne só registra (não repete a mensagem nem responde dúvidas jurídicas).
 * - A fila fica no Manager ADV (JSON da conversa): a integração com o ProJuris não pode criar tarefas
 *   (src/lib/projuris/AGENTS.md). Resumo e situação são derivados das mensagens reais a cada leitura.
 */

// ---------- Mensagem fixa (não alterar palavras, pontuação, emojis, espaços ou quebras) ----------
const LINHAS_MENSAGEM_FIXA = ['Já iremos retornar sua mensagem 😊', '📍 Por gentileza, nos informe a sua solicitação/ dúvida que encaminharemos para o advogado retornar assim que possível.'];
/** Única variável: o nome. Sem nome verificado, só "Olá,". */
export function mensagemEncaminhamento(nome?: string | undefined): string {
  const n = nome?.trim();
  return [n ? `Olá, ${n}` : 'Olá,', ...LINHAS_MENSAGEM_FIXA].join('\n');
}
/** Primeiro nome de uma fonte verificada (cadastro do ProJuris ou nome registrado), nunca inventado. */
export function primeiroNomeCliente(...fontes: (string | undefined)[]): string | undefined {
  for (const f of fontes) {
    const limpa = f?.replace(/^\s*(?:RT|AC)\s*-\s*[^-]*-\s*/i, '').trim();
    if (!limpa || /^whatsapp\s/i.test(limpa)) continue;
    const primeiro = limpa.split(/\s+/)[0] ?? '';
    if (!/^[\p{L}'-]{2,40}$/u.test(primeiro)) continue;
    return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR');
  }
  return undefined;
}

// ---------- Fila ----------
export type StatusEncaminhamento = 'aguardando' | 'em_atendimento' | 'respondido' | 'concluido';
export const ROTULO_STATUS_ENCAMINHAMENTO: Record<StatusEncaminhamento, string> = {
  aguardando: 'Aguardando atendimento', em_atendimento: 'Em atendimento', respondido: 'Respondido', concluido: 'Concluído',
};
/** Aviso fixo ao cliente: uma única reserva de envio por vez; "incerto" nunca é reenviado sozinho. */
export type EstadoAvisoEncaminhamento = 'enviando' | 'enviado' | 'nao_enviado' | 'incerto' | 'fora_horario';
export type MotivoEncaminhamento = 'saudacao' | 'falar_dra' | 'solicitacao';

export interface EncaminhamentoAdvogado {
  /** Determinístico: conversa + mensagem que abriu a solicitação. */
  id: string;
  responsavel: string;
  /** Situação registrada pela equipe (em atendimento, respondido, concluído) ou na criação; a efetiva é derivada. */
  status: StatusEncaminhamento;
  criadoEm: string;
  atualizadoEm: string;
  mensagemOrigemId: string;
  /** Mensagens do cliente que entraram nesta solicitação (ids, as mais recentes). */
  mensagensCliente: string[];
  nomeCliente: string;
  telefone: string;
  /** Processo identificado pelo cadastro do ProJuris; vazio = não identificado. */
  processo: string;
  motivo: MotivoEncaminhamento;
  aviso: { estado: EstadoAvisoEncaminhamento; mensagemId: string; em: string; idExterno?: string | undefined };
  historico: { em: string; status: StatusEncaminhamento; por: string }[];
}

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tempo = (m: Pick<Mensagem, 'dataHora'>) => Date.parse(m.dataHora ?? '');

/** "ok", "obrigado", emoji ou saudação: não muda a solicitação nem reabre uma já respondida. */
export function mensagemSemConteudo(texto: string): boolean {
  const t = fold(texto).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return !t || apenasSaudacaoAna(texto) || /^(?:ok|okay|blz|beleza|certo|perfeito|combinado|entendi|recebi|show|top|valeu|obrigad[oa]|muito obrigad[oa]|obg|grat[oa]|ta bom|tudo bem|tudo certo|sim|isso)(?: (?:obrigad[oa]|dra|doutora|viu|entao))*$/.test(t);
}

// Resposta efetiva da equipe: não basta saudação nem mensagem de espera ("vou verificar", "um momento").
const ESPERA_EQUIPE = /^(?:(?:ola|oi|bom dia|boa tarde|boa noite|tudo bem)[\s,!.]*)*(?:[a-z]+[\s,!.]+)?(?:(?:ja )?(?:vou|vamos|irei|iremos) (?:verificar|ver|conferir|checar|analisar|retornar|te retornar|responder)|um momento|so um momento|aguarde|aguarda|ja (?:te )?retorno|ja vejo|ja verifico|estou verificando|estamos verificando|recebido|anotado)\b[^?]{0,40}$/;
const CORTESIA = /\b(?:ola|oi+e?|bom dia|boa tarde|boa noite|tudo bem|tudo bom|tudo certo|como vai|como esta|prezad[oa]s?|dra|doutora|sr|sra|senhor|senhora)\b/g;
export function respostaEfetivaEquipe(texto: string): boolean {
  const t = fold(texto).replace(/\s+/g, ' ').trim();
  if (!t || apenasSaudacaoAna(texto) || ESPERA_EQUIPE.test(t.replace(/[^a-z0-9\s,!.?]/g, ''))) return false;
  // "Boa tarde, Marina!": sem as saudações, até 3 palavras é só cortesia (nome), não resposta.
  const resto = t.replace(/[^a-z\s]/g, ' ').replace(CORTESIA, ' ').replace(/\s+/g, ' ').trim();
  return resto.split(' ').filter(Boolean).length > 3 && resto.replace(/\s/g, '').length >= 12;
}

/** Mensagens da conversa a partir da que abriu a solicitação (ordem cronológica real). */
function desdeOrigem(e: Pick<EncaminhamentoAdvogado, 'mensagemOrigemId' | 'criadoEm'>, c: Conversa, canal: string): Mensagem[] {
  const hist = historicoContato(c, canal).filter(m => !m.apagadaParaTodos);
  const pos = hist.findIndex(m => m.id === e.mensagemOrigemId);
  if (pos >= 0) return hist.slice(pos);
  const inicio = Date.parse(e.criadoEm);
  return hist.filter(m => Number.isFinite(tempo(m)) && tempo(m) >= inicio);
}

/**
 * Situação efetiva, sempre pelas mensagens reais: resposta efetiva da equipe depois da última mensagem do cliente =
 * respondido; saudação/espera da equipe = em atendimento; nova mensagem do cliente depois da resposta = aguardando de
 * novo (mesma solicitação). Concluído só pela equipe.
 */
export function statusEncaminhamento(e: EncaminhamentoAdvogado, c: Conversa, canal = 'ultramsg'): StatusEncaminhamento {
  if (e.status === 'concluido') return 'concluido';
  const msgs = desdeOrigem(e, c, canal);
  let ultimaCliente = -1;
  msgs.forEach((m, i) => { if (m.de === 'cliente' && (i === 0 || !mensagemSemConteudo(m.texto) || !!m.arquivo)) ultimaCliente = i; });
  const depois = msgs.slice(ultimaCliente + 1).filter(m => origemMensagem(m) === 'equipe');
  if (depois.some(m => respostaEfetivaEquipe(m.texto))) return 'respondido';
  // Marcação manual vale até o cliente escrever de novo depois dela.
  const marcacao = e.historico.at(-1);
  const clienteDepoisDaMarcacao = !!marcacao && msgs.slice(1).some(m => m.de === 'cliente' && !mensagemSemConteudo(m.texto) && tempo(m) > Date.parse(marcacao.em));
  if (e.status === 'respondido' && !clienteDepoisDaMarcacao) return 'respondido';
  // "Em atendimento" marcado pela equipe vale até ela responder ou concluir.
  if (depois.length || e.status === 'em_atendimento') return 'em_atendimento';
  return 'aguardando';
}

/** Solicitação respondida sem novidade há 7 dias deixa de valer: o próximo contato abre outra (com a mensagem fixa). */
const VALIDADE_RESPONDIDO_MS = 7 * 86400000;
export function encaminhamentoAberto(c: Conversa, canal = 'ultramsg', agora = new Date()): EncaminhamentoAdvogado | undefined {
  const e = (c.encaminhamentos ?? []).at(-1);
  if (!e) return undefined;
  const s = statusEncaminhamento(e, c, canal);
  if (s === 'concluido') return undefined;
  if (s === 'respondido') {
    const ultima = Math.max(...desdeOrigem(e, c, canal).map(tempo).filter(Number.isFinite), Date.parse(e.atualizadoEm));
    if (agora.getTime() - ultima > VALIDADE_RESPONDIDO_MS) return undefined;
  }
  return e;
}

/** Pendente para o advogado (lista e relatório): aguardando ou em atendimento. */
export function encaminhamentoPendente(c: Conversa, canal = 'ultramsg', agora = new Date()): EncaminhamentoAdvogado | undefined {
  const e = encaminhamentoAberto(c, canal, agora);
  if (!e) return undefined;
  const s = statusEncaminhamento(e, c, canal);
  return s === 'aguardando' || s === 'em_atendimento' ? e : undefined;
}

/** Resumo objetivo: só o que o cliente escreveu nesta solicitação (nada inventado, nada interpretado). */
export function resumoSolicitacao(e: EncaminhamentoAdvogado, c: Conversa, canal = 'ultramsg', limite = 300): string {
  const textos = desdeOrigem(e, c, canal).filter(m => m.de === 'cliente' && !mensagemSemConteudo(m.texto)).map(m => m.texto.replace(/\s+/g, ' ').trim());
  const arquivos = desdeOrigem(e, c, canal).filter(m => m.de === 'cliente' && m.arquivo).length;
  if (!textos.length) return arquivos ? `Enviou ${arquivos} arquivo(s), sem texto.` : 'Ainda não informada (o cliente só cumprimentou).';
  let r = textos.join(' · ');
  if (r.length > limite) r = `…${r.slice(r.length - limite + 1)}`;
  return arquivos ? `${r} (+${arquivos} arquivo(s))` : r;
}

/**
 * Processo relacionado: um processo ativo → ele; vários → só o que o texto do cliente indicar sem ambiguidade (número
 * ou área). Segredo de justiça nunca leva número. Vazio = não identificado.
 */
export function processoRelacionado(processos: ProcessoPJ[], textos: string[]): string {
  if (!processos.length) return '';
  const t = fold(textos.join(' '));
  const digitos = t.replace(/\D/g, '');
  const area = (p: ProcessoPJ) => fold([p.assunto, p.orgao, p.vara].filter(Boolean).join(' '));
  const sinais: [RegExp, RegExp][] = [
    [/trabalh|rescis|demiss|demiti|fgts|patra|empregador|salario|hora extra/, /trabalh|\btrt\b|\bvt\b/],
    [/pensao|alimento|guarda|divorc|separac|visita|famili|filho|filha/, /famil|aliment|guarda|divorc|visita/],
    [/inventario|heranca|partilha|espolio/, /invent|heranc|sucess|partilha/],
  ];
  const porNumero = processos.filter(p => { const n = (p.numero ?? '').replace(/\D/g, ''); return n.length >= 7 && digitos.includes(n.slice(0, 7)); });
  const porArea = sinais.flatMap(([cliente, proc]) => (cliente.test(t) ? processos.filter(p => proc.test(area(p))) : []));
  const candidatos = [...new Set(porNumero.length ? porNumero : porArea)];
  const escolhido = candidatos.length === 1 ? candidatos[0] : processos.length === 1 ? processos[0] : undefined;
  if (!escolhido) return '';
  return escolhido.segredoJustica ? 'Processo em segredo de justiça (conferir no ProJuris)' : identificacaoProcesso(escolhido);
}

// ---------- Decisão: quando a mensagem do cliente ativo vai para o advogado ----------
const PEDIDO_AGENDA = /\b(?:agendar|agendamento|marcar|remarcar|reagendar|desmarcar)\b|\bcancelar\b.{0,20}\b(?:consulta|reuniao|agendamento|horario|atendimento)\b|\bconsulta (?:marcada|agendada)\b|\b(?:outro|novo) horario\b|\bhorarios?\b.{0,20}\b(?:livres?|disponive)/;

export interface SinaisFluxoAnne {
  /** Agendamento, confirmação, lembrete, cancelamento, remarcação, escolha de horário ou resposta a automação. */
  agenda: boolean;
  /** Notícia do processo pelo fluxo revisado (ou resposta a uma consulta processual em curso). */
  processo: boolean;
  /** Coleta de documentos depois do Trato feito (avaliação do documento fica com a equipe pelo fluxo próprio). */
  coleta: boolean;
}
/** Sinais calculados antes do modelo, iguais na produção e no simulador. */
export function sinaisFluxoAnne(c: Conversa, texto: string, canal: string, extras: { retornoSim?: boolean; encerramento?: string | undefined; /** Simulador: pedido na central de revisão. */ processoPendente?: boolean }, agora = new Date()): SinaisFluxoAnne {
  const a = c.agenteAna;
  const t = fold(texto);
  const agenda = !!extras.retornoSim || extras.encerramento !== undefined
    || confirmacao40Respondivel(c, canal, agora) && !!respostaConfirmacao40(texto)
    || lembreteAtivo(a?.lembreteConsulta, c.consultaAgendada, agora) && !!respostaLembreteAna(texto)
    || !!c.consultaAgendada && /^(?:sim|n[aã]o|confirmo|pode|vou manter)[.!\s]*$/i.test(texto.trim())
    || !!a?.confirmacaoCancelamento && Date.parse(a.confirmacaoCancelamento.expira) > agora.getTime()
    || a?.alteracaoConsulta === 'remarcar'
    || !!a?.horarioPendente && Date.parse(a.horarioPendente) > agora.getTime()
    || !!a?.horariosTeste?.length && !!escolherHorarioAna(a.horariosTeste, texto)
    || !!pedidoHorarioEspecifico(texto, agora) || pedidoOutrasOpcoesAna(texto) || PEDIDO_AGENDA.test(t)
    || automacoesAguardandoResposta(a?.secretaria?.automacoes, agora).length > 0;
  const pedidoPendente = !!extras.processoPendente || !!a?.pedidosProcesso?.some(p => p.status === 'pendente' && !p.evento);
  const processo = pedidoNoticiaProcesso(texto) || !!a?.aguardandoAssuntoProcesso || !!a?.aguardandoCpfProcesso || !!a?.consultaProcessoEmCurso
    || pedidoPendente && !!respostaDuranteEspera(texto, '', true);
  const coleta = emColeta(c) && perguntaAvaliacaoDocumento(texto);
  return { agenda, processo, coleta };
}

export type DecisaoEncaminhamento = 'encaminhar' | 'atualizar';
/**
 * Só cliente ativo (cadastro/processo verificado), modo Automática e encaminhamento ligado. Fica com a Anne o que é da
 * competência dela: mídia (recebimento), agenda e confirmações, notícia processual revisada, coleta e a cobrança de
 * retorno sem pendência aberta. O resto (saudação, dúvida, questão jurídica, pedido para falar com a Dra., nova
 * demanda) vai para o advogado; com pendência aberta, a mensagem só atualiza a pendência.
 */
export function decidirEncaminhamento(e: { ligado: boolean; modo: string; situacao: string; texto: string; material: boolean; sinais: SinaisFluxoAnne; cobranca: boolean; aberto: boolean }): DecisaoEncaminhamento | undefined {
  if (!e.ligado || e.modo !== 'Automática' || e.situacao !== 'ativo' || e.material || !e.texto.trim()) return undefined;
  if (e.sinais.agenda || e.sinais.processo || e.sinais.coleta) return undefined;
  if (e.cobranca && !e.aberto) return undefined;
  return e.aberto ? 'atualizar' : 'encaminhar';
}

/**
 * Claramente do advogado sem precisar da classificação do modelo: saudação, pedido para falar com a Dra./advogado e
 * cobrança de retorno de uma pendência aberta. O resto passa pela classificação (processo e agenda ficam com a Anne).
 */
export function encaminhamentoSemModelo(texto: string, cobranca: boolean): boolean {
  return cobranca || apenasSaudacaoAna(texto) || motivoEncaminhamento(texto) === 'falar_dra';
}
/** Intenções que continuam com a Anne mesmo para cliente ativo: notícia processual revisada e agendamento. */
export function intencaoDaAnne(intencao: string): boolean {
  return intencao === 'consulta_processo' || intencao === 'processo' || intencao === 'agendamento';
}

export function motivoEncaminhamento(texto: string): MotivoEncaminhamento {
  if (pedidoHumano(texto) || /\b(?:falar|conversar)\b.{0,30}\b(?:dra|doutora|carolina|advogad)/.test(fold(texto))) return 'falar_dra';
  return apenasSaudacaoAna(texto) ? 'saudacao' : 'solicitacao';
}

export interface DadosEncaminhamento {
  conversaId: string;
  mensagemId: string;
  texto: string;
  responsavel: string;
  nomeCliente: string;
  telefone: string;
  processo: string;
  /** Estado inicial do aviso ao cliente: "enviando" (reserva para enviar já) ou "fora_horario" (modelo 03 já respondeu). */
  aviso: 'enviando' | 'fora_horario';
}
const MAX_MENSAGENS = 30;
/**
 * Abre ou atualiza a pendência (dentro do CAS da conversa). `enviar` só é verdadeiro para quem reservou o aviso:
 * uma reserva de envio por vez; o aviso só é refeito se ficou "nao_enviado" (bloqueado antes de sair).
 */
export function registrarEncaminhamento(c: Conversa, d: DadosEncaminhamento, canal = 'ultramsg', agora = new Date()): { conversa: Conversa; enviar: boolean; encaminhamento: EncaminhamentoAdvogado; novo: boolean } {
  const stamp = agora.toISOString();
  const aberto = encaminhamentoAberto(c, canal, agora);
  if (aberto) {
    const reenviar = aberto.aviso.estado === 'nao_enviado' && d.aviso === 'enviando';
    const atualizado: EncaminhamentoAdvogado = {
      ...aberto,
      atualizadoEm: stamp,
      mensagensCliente: [...new Set([...aberto.mensagensCliente, d.mensagemId])].slice(-MAX_MENSAGENS),
      nomeCliente: aberto.nomeCliente || d.nomeCliente,
      telefone: aberto.telefone || d.telefone,
      processo: aberto.processo || d.processo,
      ...(aberto.motivo === 'saudacao' && motivoEncaminhamento(d.texto) !== 'saudacao' ? { motivo: motivoEncaminhamento(d.texto) } : {}),
      ...(reenviar ? { aviso: { estado: 'enviando' as const, mensagemId: d.mensagemId, em: stamp } } : {}),
    };
    return { conversa: { ...c, encaminhamentos: (c.encaminhamentos ?? []).map(x => x.id === aberto.id ? atualizado : x) }, enviar: reenviar, encaminhamento: atualizado, novo: false };
  }
  const novo: EncaminhamentoAdvogado = {
    id: `encaminhamento:${d.conversaId}:${d.mensagemId}`,
    responsavel: d.responsavel,
    status: 'aguardando',
    criadoEm: stamp,
    atualizadoEm: stamp,
    mensagemOrigemId: d.mensagemId,
    mensagensCliente: [d.mensagemId],
    nomeCliente: d.nomeCliente,
    telefone: d.telefone,
    processo: d.processo,
    motivo: motivoEncaminhamento(d.texto),
    aviso: { estado: d.aviso, mensagemId: d.mensagemId, em: stamp },
    historico: [{ em: stamp, status: 'aguardando', por: 'Anne' }],
  };
  return {
    conversa: { ...c, encaminhamentos: [...(c.encaminhamentos ?? []), novo].slice(-20), timeline: [...(c.timeline ?? []), { data: stamp, evento: `Encaminhado a ${d.responsavel}: aguardando atendimento.` }] },
    enviar: d.aviso === 'enviando', encaminhamento: novo, novo: true,
  };
}

/** Grava o resultado do aviso ao cliente na pendência (só se a reserva ainda for desta mensagem). */
export function registrarAvisoEncaminhamento(c: Conversa, encaminhamentoId: string, reservaMensagemId: string, estado: EstadoAvisoEncaminhamento, extra: { idExterno?: string | undefined; mensagemId?: string } = {}, agora = new Date()): Conversa {
  return { ...c, encaminhamentos: (c.encaminhamentos ?? []).map(e => e.id === encaminhamentoId && e.aviso.mensagemId === reservaMensagemId && e.aviso.estado === 'enviando'
    ? { ...e, aviso: { estado, mensagemId: extra.mensagemId ?? reservaMensagemId, em: agora.toISOString(), ...(extra.idExterno ? { idExterno: extra.idExterno } : {}) } } : e) };
}

/** Situação registrada pela equipe (em atendimento, respondido, concluído), com autor e data. */
export function marcarEncaminhamento(c: Conversa, encaminhamentoId: string, status: Exclude<StatusEncaminhamento, 'aguardando'>, por: string, agora = new Date()): { conversa: Conversa; ok: boolean } {
  let ok = false;
  const encaminhamentos = (c.encaminhamentos ?? []).map(e => {
    if (e.id !== encaminhamentoId || e.status === 'concluido') return e;
    ok = true;
    return { ...e, status, atualizadoEm: agora.toISOString(), historico: [...e.historico, { em: agora.toISOString(), status, por: por.slice(0, 80) }].slice(-30) };
  });
  return ok ? { conversa: { ...c, encaminhamentos, timeline: [...(c.timeline ?? []), { data: agora.toISOString(), evento: `Encaminhamento: ${ROTULO_STATUS_ENCAMINHAMENTO[status].toLowerCase()} (${por.slice(0, 80)}).` }] }, ok } : { conversa: c, ok };
}

// ---------- Relatório no WhatsApp do advogado ----------
export interface ItemRelatorioAdvogado {
  conversaId: string; nome: string; telefone: string; resumo: string; processo: string; desde: string; link: string; status: StatusEncaminhamento;
}
const FUSO = 'America/Sao_Paulo';
function partesSP(d: Date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
}
export function dataSP(d: Date) { const p = partesSP(d); return `${p['day']}/${p['month']}/${p['year']}`; }
export function horaSP(d: Date) { const p = partesSP(d); return `${p['hour']}:${p['minute']}`; }
export function diaSP(d: Date) { const p = partesSP(d); return `${p['year']}-${p['month']}-${p['day']}`; }

export function telefoneLegivel(t: string): string {
  const d = t.replace(/\D/g, '');
  const m = /^(55)(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : d ? `+${d}` : 'Não identificado';
}

export function linkConversa(base: string, conversaId: string) {
  return `${base.replace(/\/+$/, '')}/atendimento?conversa=${encodeURIComponent(conversaId)}`;
}

/** Pendências de todas as conversas, da mais antiga para a mais recente (inclusive de dias anteriores). */
export function itensRelatorioAdvogado(conversas: { id: string; conversa: Conversa }[], base: string, agora = new Date(), canal = 'ultramsg'): ItemRelatorioAdvogado[] {
  return conversas.flatMap(({ id, conversa }) => {
    const e = encaminhamentoPendente(conversa, canal, agora);
    if (!e) return [];
    return [{
      conversaId: id,
      nome: e.nomeCliente || 'Nome não identificado',
      telefone: telefoneLegivel(e.telefone || conversa.telefone),
      resumo: resumoSolicitacao(e, conversa, canal, 220),
      processo: e.processo || 'Não identificado',
      desde: e.criadoEm,
      link: linkConversa(base, id),
      status: statusEncaminhamento(e, conversa, canal),
    }];
  }).sort((a, b) => Date.parse(a.desde) - Date.parse(b.desde));
}

const SEPARADOR = '━━━━━━━━━━━━━━━━';
/** Texto do relatório consolidado (uma mensagem por horário), na estrutura definida pela Dra. */
export function textoRelatorioAdvogado(itens: ItemRelatorioAdvogado[], agora: Date, responsavel: string): string {
  if (!itens.length) return `Olá, ${responsavel}! No momento, não há clientes aguardando retorno. ✅`;
  const blocos = itens.map(i => [
    `👤 Cliente: ${i.nome}`,
    `📱 WhatsApp: ${i.telefone}`,
    `💬 Solicitação: ${i.resumo}`,
    `📂 Processo: ${i.processo}`,
    `🕐 Aguardando desde: ${dataSP(new Date(i.desde))} ${horaSP(new Date(i.desde))}`,
    `🔗 Conversa: ${i.link}`,
  ].join('\n'));
  return [
    '📋 ATENDIMENTOS PENDENTES — CS LAWYERS',
    `Olá, ${responsavel}!`,
    'Segue a lista atualizada de clientes que aguardam seu retorno.',
    `📅 Data: ${dataSP(agora)}`,
    `🕐 Horário: ${horaSP(agora)}`,
    `📌 Total de clientes pendentes: ${itens.length}`,
    ...blocos.flatMap(b => [SEPARADOR, b]),
    SEPARADOR,
    'Por gentileza, realize o atendimento dos clientes listados acima.',
  ].join('\n');
}

/** Janela de envio de cada horário (o monitor roda a cada 5 min; um ciclo perdido ainda envia dentro dela). */
export const JANELA_RELATORIO_MIN = 120;
const minutosDe = (hhmm: string) => { const [hh, mm] = hhmm.split(':').map(Number); return (hh ?? 0) * 60 + (mm ?? 0); };
/**
 * Horário do relatório devido agora (America/Sao_Paulo), o mais recente cuja janela está aberta. Só de segunda a
 * sexta e dentro do expediente do escritório (09:00–17:30): fora dele nada é enviado ao advogado, nem atrasado.
 */
export function horarioRelatorioDevido(horarios: string[], agora = new Date(), janelaMin = JANELA_RELATORIO_MIN): { horario: string; dia: string } | undefined {
  const dia = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short' }).format(agora);
  // Fim de semana e feriado nacional (mesma regra da agenda, date-holidays): nada vai ao advogado.
  if (dia === 'Sat' || dia === 'Sun' || feriadoNacional(diaSP(agora))) return undefined;
  const p = partesSP(agora);
  const minutos = Number(p['hour']) * 60 + Number(p['minute']);
  const inicioExpediente = minutosDe(EXPEDIENTE_RELATORIO.inicio), fimExpediente = minutosDe(EXPEDIENTE_RELATORIO.fim);
  if (minutos < inicioExpediente || minutos >= fimExpediente) return undefined;
  const devidos = horarios.filter(h => { const ini = minutosDe(h); return minutos >= ini && minutos < Math.min(ini + janelaMin, fimExpediente); }).sort();
  const horario = devidos.at(-1);
  return horario ? { horario, dia: diaSP(agora) } : undefined;
}
