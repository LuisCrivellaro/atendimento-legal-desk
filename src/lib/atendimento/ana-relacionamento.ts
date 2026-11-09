import type { Conversa, Mensagem } from '../mock-data';
import type { Identificacao } from '../projuris/identificacao';
import { mesmoTelefone } from '../projuris/telefone';
import { historicoContato } from './ana-contexto';
import { pedidoHumano } from './ana-scheduling';
import type { AnaResult } from './ana-rules';

/** Transient decision, not a new cadastral status or authorization to disclose legal data. */
export interface RelacionamentoAna {
  situacao: 'novo_lead' | 'ativo' | 'em_atendimento' | 'cadastro_anterior' | 'incerto';
  consultaInicial: boolean;
  quantidadeProcessos: number;
}
export function relacionamentoAna(c: Conversa, telefone: string, canal: string, identidade?: Identificacao, ativos?: number): RelacionamentoAna {
  const ligado = mesmoTelefone(c.telefone, telefone);
  const historico = ligado ? historicoContato(c, canal) : [];
  const contratacao = historico.some(m => m.de === 'escritorio' && /(?:contrato.{0,45}(?:assinad|enviad|assinatura)|(?:recebemos|recebi).{0,30}(?:seu|o) documento|trato feito)/i.test(m.texto));
  const acompanhamento = historico.some(m => m.de === 'escritorio' && /(?:acompanhamos|acompanhando|andamento registrado|seu processo.{0,25}(?:segue|esta|está))/i.test(m.texto));
  const quantidadeProcessos = identidade?.tipo === 'unico' ? ativos ?? 0 : 0;
  let situacao: RelacionamentoAna['situacao'];
  if (identidade?.tipo === 'duplicado' || identidade?.tipo === 'telefone_invalido') situacao = 'incerto';
  else if (quantidadeProcessos > 0 || ligado && (c.etapa === 'ativo' || c.contrato === 'assinado') || acompanhamento) situacao = 'ativo';
  else if (ligado && (c.etapa === 'documentos' || !!c.contrato) || contratacao) situacao = 'em_atendimento';
  else if (identidade?.tipo === 'unico' && ativos === 0) {
    const ultimaEquipe = historico.filter(m => m.de === 'escritorio').at(-1)?.texto ?? '';
    const ultimaPessoa = historico.filter(m => m.de === 'cliente').at(-1)?.texto ?? '';
    const novaConfirmada = /retomando um atendimento anterior|retoma atendimento|nova situa[cç][aã]o|nova demanda/i.test(ultimaEquipe) && /^(?:[ée] (?:uma )?)?(?:nova demanda|(?:uma )?(?:situa[cç][aã]o|caso) nov[oa])[.!\s]*$/i.test(ultimaPessoa.trim());
    situacao = novaConfirmada ? 'novo_lead' : 'cadastro_anterior';
  }
  else if (identidade?.tipo === 'unico' || identidade === undefined || c.agenteAna?.tipoCliente === 'cadastrado' || c.tipoClienteAgenda === 'cadastrado') situacao = 'incerto';
  else situacao = 'novo_lead';
  return { situacao, consultaInicial: situacao === 'novo_lead', quantidadeProcessos };
}
/** Existing clients may request a return, never consent through an obsolete acquisition invitation. */
export function permiteAgendaRelacionamento(rel: RelacionamentoAna, texto: string, c: Conversa): boolean {
  if (rel.consultaInicial) return true;
  if (rel.situacao === 'incerto' || rel.situacao === 'cadastro_anterior') return false;
  const pedido = /\b(?:quero|preciso|gostaria|podemos)\b.{0,35}\b(?:agendar|marcar|conversar)\b|\b(?:remarcar|reagendar|cancelar)\b/i;
  const anteriores = c.mensagens.filter(m => m.de === 'cliente' && m.texto !== texto).slice(-5);
  const conviteValido = anteriores.some(m => pedido.test(m.texto)) && c.agenteAna?.resultado?.intencao === 'agendamento';
  const confirmarExistente = !!c.consultaAgendada && /^(?:sim|n[aã]o|confirmo|pode|vou manter)[.!\s]*$/i.test(texto.trim());
  return pedido.test(texto) || confirmarExistente || conviteValido && /\b(?:sexta|hor[aá]rio|primeir[oa]|segund[oa]|[12])\b|\d{1,2}[:h]\d{0,2}/i.test(texto);
}
export function protegerRelacionamentoAna(r: AnaResult, rel: RelacionamentoAna, m: Mensagem, modo: string, permiteAgenda: boolean): AnaResult {
  if (rel.consultaInicial || modo === 'Desligada') return r;
  const result = { ...r, dados_coletados: { ...r.dados_coletados } };
  if (pedidoHumano(m.texto) || result.encaminhar_humano) {
    result.mensagem = 'Sua solicitação fica com a equipe responsável pelo atendimento, que responde por aqui.';
    return result;
  }
  if (result.urgente && /risco.{0,15}vida|suic[ií]d|me matar|vai me matar|agora mesmo|neste momento/i.test(m.texto)) {
    return { ...result, acao: modo === 'Sugerir' ? 'rascunho' : 'enviar', intencao: 'outro', mensagem: 'Você está em um local seguro agora? Se quiser, posso te ajudar a contatar os serviços de emergência ou a rede de proteção.', proximo_passo: 'URGENTE — preservar acompanhamento e priorizar equipe, sem consulta inicial.' };
  }
  const material = !!m.arquivo || ['video', 'imagem', 'documento'].includes(m.tipo ?? '');
  if (!material && ['processo', 'consulta_processo'].includes(result.intencao)) return { ...result, acao: 'rascunho', mensagem: '', motivo_aprovacao: 'Usar exclusivamente a consulta processual revisada.' };
  const comercial = /gratuit|primeira consulta|consulta inicial|30 minutos|hor[aá]rios.*(?:enviei|enviados)|qual.*(?:op[cç][aã]o|hor[aá]rio)|posso verificar.*hor[aá]rio/i.test(result.mensagem);
  const providenciaNaoConfirmada = /(?:salvei|encaminhei|associei|vinculei|analis[ae]i|equipe (?:já )?foi avisada)/i.test(result.mensagem);
  if (material || providenciaNaoConfirmada || !permiteAgenda && (comercial || result.intencao === 'agendamento' || result.intencao === 'novo_caso') || rel.situacao === 'cadastro_anterior' || rel.situacao === 'incerto') {
    result.intencao = material ? 'documento' : 'duvida_geral';
    result.acao = modo === 'Sugerir' ? 'rascunho' : 'enviar';
    result.motivo_aprovacao = '';
    result.proximo_passo = material ? 'Material recebido na conversa; equipe confere a vinculação ao caso, sem associação automática.' : 'Continuar contexto existente; esclarecer demanda sem iniciar captação.';
    result.mensagem = rel.situacao === 'incerto' ? 'Esse assunto é de um atendimento que já está em andamento conosco ou é uma nova demanda?'
      : rel.situacao === 'cadastro_anterior' ? 'Você está retomando um atendimento anterior ou precisa de ajuda com uma nova situação?'
      : material ? `Obrigada pelo envio!${rel.quantidadeProcessos > 1 ? ' Esse material está relacionado a qual dos seus atendimentos?' : ' O material está nesta conversa para conferência da equipe responsável pelo seu atendimento.'}`
      : 'Entendi. Esse acontecimento está relacionado ao atendimento que já acompanhamos para você ou é uma situação nova?';
  } else if (comercial) {
    result.mensagem = 'Posso verificar a disponibilidade para um atendimento de acompanhamento com a Dra. Carolina.';
  }
  return result;
}