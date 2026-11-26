import type { Conversa, Mensagem } from '../mock-data';
import type { Identificacao } from '../projuris/identificacao';
import { mesmoTelefone } from '../projuris/telefone';
import { historicoContato } from './ana-contexto';
import { pedidoHumano } from './ana-scheduling';
import type { AnaResult } from './ana-rules';
import { pedidoNoticiaProcesso } from './consulta-processo';
import { origemMensagem } from './secretaria/origem';
import { ACOMPANHAMENTO_ANA, COMO_AJUDAR_ANA, COMO_AJUDAR_CONTEUDO_ANA, CONVITE_ATENDIMENTO_ANA, PEDIDO_ASSUNTO_ANA, SAUDACAO_CONTATO_ANA, demandaNovaRelatada, leituraMensagemAna, semPerguntaTriagemAna } from './ana-demanda';

/** Transient decision, not a new cadastral status or authorization to disclose legal data. */
export interface RelacionamentoAna {
  situacao: 'novo_lead' | 'ativo' | 'em_atendimento' | 'cadastro_anterior' | 'incerto';
  consultaInicial: boolean;
  quantidadeProcessos: number;
}
// Pergunta antiga, removida em 26/11/2026: respostas a ela já gravadas no histórico continuam valendo.
const PERGUNTA_RELACAO = /retomando um atendimento anterior|retoma atendimento|nova situa[cç][aã]o|nova demanda|situa[cç][aã]o nova/i;
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PASSAGEM_EQUIPE = 'Sua solicitação fica com a equipe responsável pelo atendimento, que responde por aqui.';
const CONVITE_ACOMPANHAMENTO = 'Posso verificar a disponibilidade para um atendimento de acompanhamento com a Dra. Carolina.';
/** Resposta "nova demanda" (com variações informais) dada à pergunta antiga de relacionamento; persiste no histórico. */
export function respondeuNovaDemanda(historico: Mensagem[]): boolean {
  return historico.some((m, i) => m.de === 'cliente'
    && historico.slice(0, i).filter(x => x.de === 'escritorio').at(-1) !== undefined
    && PERGUNTA_RELACAO.test(historico.slice(0, i).filter(x => x.de === 'escritorio').at(-1)!.texto)
    && /^(?:(?:sim|e|eh|seria|acho que|acredito que)[,\s]+)*(?:(?:e|eh)\s+)?(?:uma?\s+)?(?:nova(?:\s+demanda)?|novo(?:\s+caso)?|(?:situacao|caso|assunto|demanda)\s+nov[oa]|demanda\s+nova|e\s+novo|primeira vez)(?:\s+sim)?[.!\s]*$/.test(fold(m.texto).trim()));
}
/** Anne já ofereceu a consulta gratuita e nenhuma pessoa da equipe falou depois: não reclassificar o mesmo contato. */
function captacaoJaIniciadaPelaAnne(historico: Mensagem[]): boolean {
  return historico.some(m => m.de === 'escritorio' && origemMensagem(m) !== 'equipe' && /primeira consulta [ée] on-line e gratuita/i.test(m.texto))
    && !historico.some(m => origemMensagem(m) === 'equipe');
}
export function relacionamentoAna(c: Conversa, telefone: string, canal: string, identidade?: Identificacao, ativos?: number): RelacionamentoAna {
  const ligado = mesmoTelefone(c.telefone, telefone);
  const historico = ligado ? historicoContato(c, canal) : [];
  const contratacao = historico.some(m => m.de === 'escritorio' && /(?:contrato.{0,45}(?:assinad|enviad|assinatura)|(?:recebemos|recebi).{0,30}(?:seu|o) documento|trato feito)/i.test(m.texto));
  const acompanhamento = historico.some(m => m.de === 'escritorio' && /(?:acompanhamos|acompanhando|andamento registrado|seu processo.{0,25}(?:segue|esta|está))/i.test(m.texto));
  const quantidadeProcessos = identidade?.tipo === 'unico' ? ativos ?? 0 : 0;
  // Classificação interna: a nova demanda se reconhece pelo conteúdo do que o cliente escreveu, nunca por pergunta.
  const demanda = demandaNovaRelatada(historico);
  const novaDemanda = respondeuNovaDemanda(historico) || captacaoJaIniciadaPelaAnne(historico);
  let situacao: RelacionamentoAna['situacao'];
  if (identidade?.tipo === 'duplicado' || identidade?.tipo === 'telefone_invalido') situacao = 'incerto';
  else if (quantidadeProcessos > 0 || ligado && (c.etapa === 'ativo' || c.contrato === 'assinado') || acompanhamento) situacao = 'ativo';
  else if (ligado && (c.etapa === 'documentos' || !!c.contrato) || contratacao) situacao = 'em_atendimento';
  // Ex-cliente sem processo ativo: um relato de problema jurídico ou pedido de consulta já é a nova demanda.
  else if (identidade?.tipo === 'unico' && ativos === 0) situacao = novaDemanda || demanda.relato ? 'novo_lead' : 'cadastro_anterior';
  // Vínculo em conferência: só sinal explícito (pedido de consulta ou "outro assunto" com relato).
  else if (novaDemanda || demanda.forte) situacao = 'novo_lead';
  else if (identidade?.tipo === 'unico' || identidade === undefined || c.agenteAna?.tipoCliente === 'cadastrado' || c.tipoClienteAgenda === 'cadastrado') situacao = 'incerto';
  else situacao = 'novo_lead';
  return { situacao, consultaInicial: situacao === 'novo_lead', quantidadeProcessos };
}
/** "Sim" explícito ao convite de atendimento da Anne (cliente da casa): libera a agenda de cadastrado. */
export function aceiteConviteAtendimentoAna(texto: string, anterior: string): boolean {
  const convite = anterior.trim();
  return (convite === CONVITE_ATENDIMENTO_ANA || convite.startsWith(CONVITE_ACOMPANHAMENTO.slice(0, -1)))
    && /^(?:sim|pode|pode sim|sim pode|pode ser|quero|quero sim|sim quero|gostaria|sim gostaria|por favor|sim por favor|vamos|pode verificar|claro|ok pode)[.!\s]*$/i.test(texto.trim());
}
/** Existing clients may request a return, never consent through an obsolete acquisition invitation. */
export function permiteAgendaRelacionamento(rel: RelacionamentoAna, texto: string, c: Conversa): boolean {
  if (rel.consultaInicial) return true;
  if (rel.situacao === 'incerto' || rel.situacao === 'cadastro_anterior') return false;
  const pedido = /\b(?:quero|preciso|gostaria|podemos)\b.{0,35}\b(?:agendar|marcar|conversar)\b|\b(?:remarcar|reagendar|cancelar)\b/i;
  const anteriores = c.mensagens.filter(m => m.de === 'cliente' && m.texto !== texto).slice(-5);
  const conviteValido = anteriores.some(m => pedido.test(m.texto)) && c.agenteAna?.resultado?.intencao === 'agendamento';
  const confirmarExistente = !!c.consultaAgendada && /^(?:sim|n[aã]o|confirmo|pode|vou manter)[.!\s]*$/i.test(texto.trim());
  const anteriorEscritorio = c.mensagens.filter(m => m.de === 'escritorio').at(-1)?.texto ?? '';
  return pedido.test(texto) || confirmarExistente || conviteValido && /\b(?:sexta|hor[aá]rio|primeir[oa]|segund[oa]|[12])\b|\d{1,2}[:h]\d{0,2}/i.test(texto) || aceiteConviteAtendimentoAna(texto, anteriorEscritorio);
}
/**
 * Contato já conhecido (consultaInicial=false): nunca captação automática, e a dúvida sobre o vínculo é resolvida
 * internamente — pela leitura da mensagem, pelo histórico e, quando preciso, pela equipe —, nunca com uma pergunta
 * ao cliente sobre "atendimento em andamento ou nova demanda".
 */
export function protegerRelacionamentoAna(r: AnaResult, rel: RelacionamentoAna, m: Mensagem, modo: string, permiteAgenda: boolean, c?: Conversa): AnaResult {
  if (modo === 'Desligada') return r;
  if (rel.consultaInicial) {
    const mensagem = semPerguntaTriagemAna(r.mensagem);
    return mensagem === r.mensagem ? r : { ...r, mensagem };
  }
  const result = { ...r, dados_coletados: { ...r.dados_coletados } };
  if (pedidoHumano(m.texto) || result.encaminhar_humano) {
    result.mensagem = PASSAGEM_EQUIPE;
    return result;
  }
  if (result.urgente && /risco.{0,15}vida|suic[ií]d|me matar|vai me matar|agora mesmo|neste momento/i.test(m.texto)) {
    return { ...result, acao: modo === 'Sugerir' ? 'rascunho' : 'enviar', intencao: 'outro', mensagem: 'Você está em um local seguro agora? Se quiser, posso te ajudar a contatar os serviços de emergência ou a rede de proteção.', proximo_passo: 'URGENTE — preservar acompanhamento e priorizar equipe, sem consulta inicial.' };
  }
  const material = !!m.arquivo || ['video', 'imagem', 'documento'].includes(m.tipo ?? '');
  if (!material && (['processo', 'consulta_processo'].includes(result.intencao) || pedidoNoticiaProcesso(m.texto))) return { ...result, acao: 'rascunho', mensagem: '', motivo_aprovacao: 'Usar exclusivamente a consulta processual revisada.' };
  const conhecido = rel.situacao === 'ativo' || rel.situacao === 'em_atendimento';
  const leitura = material ? 'conteudo' : leituraMensagemAna(m.texto);
  const responder = (mensagem: string, proximo: string, intencao: AnaResult['intencao'] = 'duvida_geral', humano = false): AnaResult =>
    ({ ...result, intencao, acao: modo === 'Sugerir' ? 'rascunho' : 'enviar', motivo_aprovacao: '', encaminhar_humano: humano, mensagem, proximo_passo: proximo });
  if (material) {
    return responder(conhecido
      ? `Obrigada pelo envio!${rel.quantidadeProcessos > 1 ? ' Esse material está relacionado a qual dos seus atendimentos?' : ' O material está nesta conversa para conferência da equipe responsável pelo seu atendimento.'}`
      : 'Obrigada pelo envio! O material está nesta conversa para a equipe conferir.',
      'Material recebido na conversa; equipe confere a vinculação ao caso, sem associação automática.', 'documento');
  }
  // Saudação não é nova demanda: cumprimentar e perguntar como ajudar, sem triagem nem nova oferta.
  if (leitura === 'saudacao') return responder(SAUDACAO_CONTATO_ANA, 'Contato conhecido cumprimentou; aguardar o assunto, sem triagem nem nova oferta.');
  if (leitura === 'outro_assunto') return responder(PEDIDO_ASSUNTO_ANA, 'Contato conhecido quer tratar de outro assunto; aguardar o relato, classificado internamente.');
  const comercial = /gratuit|primeira consulta|consulta inicial|30 minutos|hor[aá]rios.*(?:enviei|enviados)|qual.*(?:op[cç][aã]o|hor[aá]rio)|posso verificar.*hor[aá]rio/i.test(result.mensagem);
  const providenciaNaoConfirmada = /(?:salvei|encaminhei|associei|vinculei|analis[ae]i|equipe (?:já )?foi avisada)/i.test(result.mensagem);
  if (providenciaNaoConfirmada || !permiteAgenda && (comercial || result.intencao === 'agendamento' || result.intencao === 'novo_caso')) {
    if (conhecido) {
      if (leitura === 'nova_demanda' || respondeuNovaDemanda(c?.mensagens ?? [])) return responder(CONVITE_ATENDIMENTO_ANA, 'Cliente da casa trouxe nova demanda (identificada pelo conteúdo); convite para atendimento com a Dra. Carolina na agenda de cadastrado, só com aceite explícito.');
      if (leitura === 'indefinida') return responder(COMO_AJUDAR_ANA, 'Intenção não identificada; perguntar como ajudar, sem triagem.');
      return responder(ACOMPANHAMENTO_ANA, 'Cliente da casa relatou acontecimento; continuar o atendimento existente, equipe responsável acompanha, sem captação.');
    }
    // Vínculo em conferência (telefone em mais de um cadastro, cadastro sem confirmação): a equipe confirma, o cliente não classifica.
    if (leitura === 'nova_demanda') return responder(PASSAGEM_EQUIPE, 'Nova demanda de contato com vínculo em conferência: equipe confirma o cadastro antes de qualquer oferta; nada foi perguntado ao cliente.', 'outro', true);
    return responder(leitura === 'conteudo' ? COMO_AJUDAR_CONTEUDO_ANA : COMO_AJUDAR_ANA, 'Contato conhecido sem intenção identificada; perguntar como ajudar, sem triagem.');
  }
  if (comercial) result.mensagem = CONVITE_ACOMPANHAMENTO;
  result.mensagem = semPerguntaTriagemAna(result.mensagem);
  return result;
}
