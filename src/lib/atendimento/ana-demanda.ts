import type { Conversa, Mensagem } from '../mock-data';
import { historicoContato } from './ana-contexto';
import { origemMensagem } from './secretaria/origem';

/**
 * Leitura interna das mensagens de contatos (cliente da casa, ex-cliente, lead ou vínculo em conferência).
 * Regra da Dra. Carolina (26/11/2026): a classificação do atendimento é sempre interna — cadastro, histórico
 * (inclusive as falas da equipe) e conteúdo da mensagem. A Anne nunca transfere essa decisão ao cliente:
 * não pergunta se o assunto é de um atendimento em andamento ou uma nova demanda, se a pessoa já é cliente
 * ou se é o primeiro contato, nem com outras palavras.
 */

export const SAUDACAO_CONTATO_ANA = 'Olá! Tudo bem? Como posso te ajudar?';
export const PEDIDO_ASSUNTO_ANA = 'Claro! Pode me contar um pouco sobre o assunto?';
export const COMO_AJUDAR_ANA = 'Claro! Como posso te ajudar?';
export const COMO_AJUDAR_CONTEUDO_ANA = 'Entendi. Como posso te ajudar com isso?';
/** Cliente da casa com nova demanda: convite para atendimento (agenda de cadastrado), aceito só com "sim" explícito. */
export const CONVITE_ATENDIMENTO_ANA = 'Entendi. Quem avalia isso é a Dra. Carolina. Posso verificar um horário para você conversar com ela?';
/** Cliente da casa relata acontecimento: reconhecer e continuar o atendimento existente, sem captação. */
export const ACOMPANHAMENTO_ANA = 'Entendi, obrigada por avisar. Sua mensagem está nesta conversa para a equipe responsável pelo seu atendimento acompanhar.';

export type LeituraMensagem = 'saudacao' | 'outro_assunto' | 'nova_demanda' | 'indefinida' | 'conteudo';

const letras = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

const CUMPRIMENTO = '(?:ola|oi+e?|opa|alo|bom dia|boa tarde|boa noite|tudo bem|tudo bom|tudo certo|tudo joia|td bem|e ai|eai|como vai|como esta|como vao|hello|hey|ei|dra|doutora|doutor|carolina|anne|ana|pessoal|equipe|gente|prezad[oa]s?|com voce|com vc|com voces|e com voce)';
const SO_CUMPRIMENTO = new RegExp(`^(?:${CUMPRIMENTO}\\s*)+$`);
const INICIO_CUMPRIMENTO = new RegExp(`^(?:${CUMPRIMENTO}\\s*)+`);
const PEDIDO_CONSULTA = /\b(?:quero|queria|gostaria|preciso|precisava|podemos|posso|vamos|da pra|tem como|consigo)\b.{0,40}\b(?:agendar|marcar)\b|\b(?:agendar|marcar)\b.{0,25}\b(?:consulta|reuniao|horario|atendimento|conversa)\b|\b(?:quero|queria|gostaria|preciso|precisava)\b.{0,15}\b(?:uma|nova|outra) consulta\b/;
const NOVO_ASSUNTO = /\b(?:outr[oa]s?|nov[oa]s?|diferentes?)\s+(?:assuntos?|questao|questoes|casos?|demandas?|situacao|situacoes|problemas?|temas?|acao|acoes)\b|\b(?:assunto|caso|demanda|situacao|problema|tema|questao)\s+(?:nov[oa]|diferente)\b|\bnao (?:e|eh) (?:sobre )?(?:o|a|esse|essa|aquele|aquela|meu|minha) (?:mesm[oa] )?(?:processo|caso|assunto|atendimento)\b/;
const RELATO = /\b(?:demiti\w*|demissao|mandad[oa] embora|rescisao|justa causa|aviso previo|seguro desemprego|fgts|ctps|carteira (?:assinada|de trabalho)|registro em carteira|holerite|salario\w*|horas? extras?|ferias|decimo terceiro|insalubridade|periculosidade|acidente\w*|assedio|patra[oa]|chefe|empregador\w*|trabalhista|divorci\w*|separa(?:cao|r|da|do)|pensao|alimentos|guarda (?:do|da|dos|das|compartilhada|unilateral)|visitas?|visitacao|inventario|heranca|partilha|testamento|uniao estavel|paternidade|violencia|agress\w*|me bate|me bateu|ameac\w*|medida protetiva|despejo|aluguel|inquilin\w*|negativad\w*|nome sujo|serasa|plano de saude|golpe|indeniza\w*|danos? morais|processar|entrar com (?:uma |um )?(?:acao|processo)|abrir (?:uma |um )?(?:acao|processo)|(?:preciso|procuro|procurando|quero) (?:de )?(?:um|uma) advogad\w*|voces (?:atendem|fazem|trabalham|cuidam)|atendem (?:caso|causa|questao)|problema com|ajuda com|cobranca indevida|vizinh\w*|imovel|usucapiao)\b/;
const VAGO = /^(?:(?:eu )?(?:preciso|precisava|queria|gostaria|quero)(?: de)?(?: uma| um| umas| alguma| algumas| mais uma)? (?:ajuda|informacao|informacoes|orientacao|orientacoes|tirar (?:uma |umas )?duvidas?|falar|conversar)(?: com (?:voces|voce|vc|vcs|a dra|a doutora|alguem|a equipe|o escritorio))?|tenho (?:uma |outra |mais uma |umas )?(?:duvidas?|perguntas?)|(?:voce|vc|voces|vcs) (?:pode|podem|poderia|poderiam|consegue|conseguem) me ajudar|pode(?:ria)? me ajudar|(?:uma|outra) (?:duvida|pergunta|informacao)|me ajuda|ajuda|socorro|preciso de voces|(?:estou|to) precisando de ajuda)(?: por favor| pf| pfv| pfvr)?$/;

/** Só cumprimento ("Olá.", "oi, tudo bem?", "Boa tarde, Dra."): não é nova demanda nem pedido de agenda. */
export function apenasSaudacaoAna(texto: string): boolean {
  const t = letras(texto);
  return t.length > 0 && SO_CUMPRIMENTO.test(t);
}

/** Pedido explícito de consulta/atendimento (não remarcação nem cancelamento). */
export function pedidoConsultaAna(texto: string): boolean {
  const t = letras(texto);
  return PEDIDO_CONSULTA.test(t) && !/\b(?:remarc|reagend|cancel|desmarc)/.test(t);
}

/** Classificação interna da intenção da mensagem, sem perguntar nada ao cliente. */
export function leituraMensagemAna(texto: string): LeituraMensagem {
  const t = letras(texto);
  if (!t) return 'indefinida';
  if (SO_CUMPRIMENTO.test(t)) return 'saudacao';
  const corpo = t.replace(INICIO_CUMPRIMENTO, '').trim();
  if (pedidoConsultaAna(texto) || RELATO.test(t)) return 'nova_demanda';
  // "Gostaria de falar sobre outro assunto": pedir o relato; com o relato junto, já é a nova demanda.
  if (NOVO_ASSUNTO.test(t)) return corpo.split(' ').length > 10 ? 'nova_demanda' : 'outro_assunto';
  if (VAGO.test(corpo)) return 'indefinida';
  return 'conteudo';
}

export interface DemandaRelatada {
  /** O cliente descreveu um problema jurídico ou pediu consulta. */
  relato: boolean;
  /** Além do relato, sinal explícito de assunto novo ou pedido de consulta (vale para vínculo em conferência). */
  forte: boolean;
}
const JANELA_DEMANDA_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Nova demanda reconhecida pelo conteúdo das mensagens do cliente depois da última fala da equipe (a equipe que
 * falou depois decide) e nos últimos 30 dias da conversa. Substitui a pergunta "atendimento em andamento ou nova
 * demanda?", removida em 26/11/2026.
 */
export function demandaNovaRelatada(historico: Mensagem[]): DemandaRelatada {
  const iEquipe = historico.map(m => origemMensagem(m)).lastIndexOf('equipe');
  const recentes = historico.slice(iEquipe + 1);
  const ultimo = Date.parse(historico.at(-1)?.dataHora ?? '');
  let relato = false;
  let sinal = false;
  recentes.forEach((m, k) => {
    if (m.de !== 'cliente' || m.apagadaParaTodos) return;
    const t = Date.parse(m.dataHora ?? '');
    if (Number.isFinite(ultimo) && Number.isFinite(t) && ultimo - t > JANELA_DEMANDA_MS) return;
    const leitura = leituraMensagemAna(m.texto);
    const anterior = recentes.slice(0, k).filter(x => x.de === 'escritorio').at(-1)?.texto.trim() ?? '';
    const respondeAssunto = anterior === PEDIDO_ASSUNTO_ANA && (leitura === 'conteudo' || leitura === 'nova_demanda');
    if (leitura === 'nova_demanda' || respondeAssunto) relato = true;
    if (pedidoConsultaAna(m.texto) || NOVO_ASSUNTO.test(letras(m.texto)) || respondeAssunto) sinal = true;
  });
  return { relato, forte: relato && sinal };
}

// Mesmo limite de INTERVALO_RETORNO_ANA_MS (ana-retomada.ts): outro dia ou 4 h depois é uma nova sessão.
const SESSAO_MS = 4 * 60 * 60 * 1000;
const diaSP = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
/**
 * Duas saudações seguidas na mesma sessão: o escritório já respondeu à primeira, então a segunda não recebe outra
 * resposta (uma resposta só, sem duplicidade). Saudação depois de um assunto, ou em outra sessão, segue normal.
 */
export function saudacaoRepetidaAna(c: Conversa, messageId: string, canal: string, agora = new Date()): boolean {
  const hist = historicoContato(c, canal);
  const pos = hist.findIndex(m => m.id === messageId);
  const atual = hist[pos];
  if (pos < 1 || !atual || atual.arquivo || !apenasSaudacaoAna(atual.texto)) return false;
  const anteriores = hist.slice(0, pos);
  const iCliente = anteriores.map(m => m.de).lastIndexOf('cliente');
  const anteriorCliente = anteriores[iCliente];
  if (!anteriorCliente || anteriorCliente.arquivo || !apenasSaudacaoAna(anteriorCliente.texto)) return false;
  if (!anteriores.slice(iCliente + 1).some(m => m.de === 'escritorio' && !m.apagadaParaTodos)) return false;
  const ultima = Date.parse(anteriores.at(-1)?.dataHora ?? '');
  const t = Date.parse(atual.dataHora ?? '') || agora.getTime();
  return !Number.isFinite(ultima) || t - ultima < SESSAO_MS && diaSP(t) === diaSP(ultima);
}

// ---------- Pergunta de triagem proibida (e variações) ----------
const NOMES_ASSUNTO = '(?:assunto|caso|demanda|situacao|questao|atendimento|problema|pedido|solicitacao|tema)';
const MARCA_NOVO = new RegExp(`\\b(?:nov[oa]s? ${NOMES_ASSUNTO}|${NOMES_ASSUNTO} (?:e |eh |seria |sera )?(?:nov[oa]|diferente)|primeiro contato|primeira vez|algo novo|outr[oa] (?:demanda|caso|assunto|situacao|questao|tema|problema|processo|pedido))\\b`);
const MARCA_EXISTENTE = /\b(?:em andamento|andamento|ja (?:esta|estava|acompanhamos|acompanha|existe|existia|temos|tem|tinha|possui|e|era|foi|fez|teve|estamos)|anterior|anteriormente|existente|retomand\w*|retomar|retoma|conosco|com a gente|com o escritorio|que acompanhamos|mesmo (?:caso|assunto|atendimento|processo)|relacionad\w*|relacao|continuacao|continuidade|antig[oa]|atual|em curso)\b/;
const PERGUNTA_CLIENTE = new RegExp([
  '\\bja (?:e|eh|era|foi|sou) (?:nosso |nossa |um |uma )?client\\w*',
  '\\b(?:e|eh) (?:nosso |nossa )?client[ea] (?:do|da|nosso|nossa|aqui|conosco)\\b',
  '\\bja (?:tem|possui|tinha|teve) (?:cadastro|processo|atendimento|caso) (?:conosco|com a gente|aqui|com o escritorio|no escritorio|com a dra|com a doutora)\\b',
  '\\b(?:e|eh) (?:o )?(?:seu |teu )?primeiro contato\\b',
  '\\bprimeiro contato (?:com|conosco)\\b',
  '\\b(?:e|eh|seria|sera) (?:sobre |do |da )?(?:o |a )?mesm[oa] (?:caso|assunto|atendimento|processo|demanda)\\b',
  '\\bja (?:esta|estava) em andamento\\b',
  // "É uma nova demanda?", "É algo novo?", "Esse assunto é novo ou ...?"
  `\\b(?:e|eh|seria|sera|se trata de|trata se de) (?:um |uma |algo |de um |de uma )?(?:${NOMES_ASSUNTO} )?(?:nov[oa]|diferente)(?: ${NOMES_ASSUNTO})?(?: ou\\b.*)?$`,
].join('|'));
const frases = (texto: string) => texto.split(/(?<!\b(?:Dra|Dr|Sra|Sr)\.)(?<=[.!?])\s+|\n/);
function fraseTriagem(frase: string): boolean {
  if (!frase.includes('?')) return false;
  const t = letras(frase);
  return MARCA_NOVO.test(t) && MARCA_EXISTENTE.test(t) || PERGUNTA_CLIENTE.test(t);
}
/** Pergunta que transfere ao cliente a classificação do atendimento (proibida em qualquer variação). */
export function perguntaTriagemAna(texto: string): boolean {
  return frases(texto).some(fraseTriagem);
}
/** Remove as perguntas de triagem; se sobrar só um acolhimento curto, pergunta naturalmente como ajudar. */
export function semPerguntaTriagemAna(texto: string): string {
  if (!perguntaTriagemAna(texto)) return texto;
  const limpa = texto.split('\n').map(linha => linha.split(/(?<!\b(?:Dra|Dr|Sra|Sr)\.)(?<=[.!?])\s+/).filter(p => !fraseTriagem(p)).join(' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return letras(limpa).replace(/\s/g, '').length >= 20 ? limpa : COMO_AJUDAR_ANA;
}
