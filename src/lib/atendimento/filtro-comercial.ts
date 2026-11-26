import type { Conversa, Mensagem } from '../mock-data';
import { registrarAviso } from './avisos-equipe';

/**
 * Filtro de comunicação comercial, antes de qualquer resposta automática da Anne (produção e simulador).
 * Determinístico e sem modelo: pesa sinais de intenção comercial (oferta, curso, assinatura, prospecção para o
 * escritório, lista de transmissão, robô de atendimento) contra sinais de quem procura atendimento jurídico
 * (problema próprio com cobrança, contrato, plano, empresa; pedido de consulta; pergunta sobre o escritório).
 * - comercial: a Anne não responde, não inicia atendimento nem agenda; a mensagem fica no histórico, marcada.
 * - duvida: também sem resposta; vai em silêncio para a equipe conferir (aviso interno).
 * - atender: segue o fluxo normal da Anne.
 * Contato já conhecido (cliente, consulta, contrato, conversa com o escritório) nunca é ignorado sozinho: no
 * máximo vira dúvida para a equipe.
 */

export type ResultadoFiltroComercial = 'comercial' | 'duvida' | 'atender';

export interface ClassificacaoComercial {
  resultado: ResultadoFiltroComercial;
  pontos: number;
  sinaisComerciais: string[];
  sinaisCliente: string[];
}

export interface ContextoFiltroComercial {
  /** Cliente, consulta, contrato, vínculo, etapa adiantada ou conversa anterior com o escritório. */
  contatoConhecido: boolean;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Categorias comerciais: o primeiro sinal vale o peso; cada sinal extra da mesma categoria soma 2 (até `maximo`). */
const CATEGORIAS: { nome: string; peso: number; maximo: number; sinais: RegExp[] }[] = [
  {
    nome: 'lista de transmissão ou descadastro', peso: 5, maximo: 7,
    sinais: [
      /\b(?:responda|digite|envie|mande)\s+(?:a\s+palavra\s+)?["']?(?:sair|pare|stop|cancelar|remover)\b/,
      /\bpara\s+(?:nao|deixar\s+de)\s+receber\b/,
      /\bdescadastr/,
      /\bnewsletter\b/,
      /\blista\s+de\s+transmissao\b/,
    ],
  },
  {
    nome: 'robô de atendimento de outra empresa', peso: 5, maximo: 7,
    sinais: [
      /\b(?:sou|aqui e|eu sou)\s+(?:a|o)\s+(?:assistente|atendente|robo)\s+virtual\b/,
      /\b(?:mensagem|resposta|atendimento)\s+automatic[ao]\b/,
      /\bdigite\s+(?:o\s+)?(?:numero|n[ºo°]|opcao)\b/,
      /\bescolha\s+uma\s+das\s+opcoes\b/,
      /\bmenu\s+(?:principal|de\s+opcoes)\b/,
      /\bprotocolo\s+(?:de\s+atendimento\s+)?(?:n[ºo°]|numero)\b/,
      /\bem\s+breve\s+(?:um|uma)\s+(?:de\s+nossos|atendente|consultor)/,
    ],
  },
  {
    nome: 'promoção ou oferta', peso: 3, maximo: 7,
    sinais: [
      /\bpromo(?:cao|cional|coes)\b/,
      /\bofertas?\s+(?:especial|especiais|exclusiva|exclusivas|imperdive|relampago|valida)/,
      /\bdescontos?\s+de\s+(?:ate\s+)?\d/,
      /\b\d{1,2}\s?%\s?(?:de\s+desconto|off)\b/,
      /\bcupom\b/,
      /\bblack\s?friday\b/,
      /\bfrete\s+gratis\b/,
      /\baproveite\b/,
      /\bgaranta\s+(?:ja|agora|o\s+seu|a\s+sua|sua|seu)\b/,
      /\b(?:ultimas|poucas)\s+vagas\b|\bvagas\s+limitadas\b/,
      /\bso\s+(?:hoje|ate\s+amanha)\b|\bpor\s+tempo\s+limitado\b/,
      /\bcondicao\s+especial\b/,
      /\bcompre\s+(?:ja|agora|o\s+seu|a\s+sua)\b/,
    ],
  },
  {
    nome: 'curso, evento ou material', peso: 3, maximo: 7,
    sinais: [
      /\binscricoes\s+abertas\b/,
      /\b(?:curso|mentoria|workshop|webinar|webinario|imersao|masterclass|palestra|congresso|treinamento|aula\s+gratuita|e-?book)\b[^.!?]{0,80}\b(?:inscri|vagas|garanta|acesse|participe|matricul|link|gratuit|online)/,
      /\b(?:inscreva-se|matricule-se|participe\s+gratuitamente)\b/,
    ],
  },
  {
    nome: 'venda de plano, assinatura ou serviço', peso: 3, maximo: 7,
    sinais: [
      /\bassine\s+(?:ja|agora|o|a|nosso|nossa)\b/,
      /\bplanos?\s+a\s+partir\s+de\b/,
      /\bpor\s+apenas\s+r\$/,
      /\b(?:teste|periodo)\s+gratis\b|\bperiodo\s+de\s+teste\b/,
      /\bdemonstracao\s+gratuita\b/,
      /\bmensalidades?\s+de\s+apenas\b/,
    ],
  },
  {
    nome: 'prospecção comercial para o escritório', peso: 3, maximo: 7,
    sinais: [
      /\b(?:seu|sua|para\s+o\s+seu|para\s+a\s+sua)\s+(?:escritorio|banca|empresa|negocio)\b/,
      /\bescritorios?\s+de\s+advocacia\b|\bpara\s+advogad|\badvogados?\s+que\s+(?:querem|desejam)\b/,
      /\bmarketing\s+juridico\b|\btrafego\s+pago\b|\bcaptacao\s+de\s+clientes\b|\bgestao\s+de\s+redes\s+sociais\b/,
      /\b(?:software|sistema|plataforma|ferramenta|solucao)\s+(?:juridic|para\s+advog|para\s+escritor)/,
      /\bgostaria(?:mos)?\s+de\s+apresentar\b|\bapresentar\s+(?:nossa|nossos|nossas|a\s+nossa|o\s+nosso)\b/,
      /\b(?:proposta\s+de\s+parceria|parceria\s+comercial)\b/,
      /\bnossa\s+empresa\s+(?:oferece|trabalha|e\s+especializada)\b|\bsomos\s+(?:uma|a)\s+(?:empresa|agencia|startup|consultoria)\b/,
      /\bagendar\s+uma\s+(?:reuniao|demonstracao|call|apresentacao)\b/,
      /\b(?:falar|conversar)\s+com\s+o\s+responsavel\s+(?:pelo|pela)\s+(?:escritorio|marketing|financeiro|compras|ti)\b/,
    ],
  },
];

/** Sinais de quem procura atendimento jurídico (problema próprio, pedido de consulta, pergunta ao escritório). */
const CLIENTE: [RegExp, string][] = [
  [/\b(?:fui|fomos|estou\s+sendo|estamos\s+sendo)\s+(?:cobrad|demitid|despedid|mandad[oa]\s+embora|enganad|lesad|prejudicad|negativad|assediad|ameacad|processad)/, 'relata problema próprio'],
  [/\b(?:cobranca|cobrancas|desconto|descontos|juros|tarifa|tarifas|multa)\s+(?:indevid|abusiv|errad|que\s+nao)/, 'cobrança contestada'],
  [/\b(?:continuam|continua|estao|esta)\s+(?:me\s+)?cobrando\b/, 'cobrança contestada'],
  [/\b(?:meu|minha|meus|minhas)\s+(?:plano|contrato|processo|beneficio|aposentadoria|salario|rescisao|ferias|fgts|inss|pensao|divorcio|guarda|nome|cpf|filh[oa]s?|marido|esposa|ex|carteira|patrao|chefe|consulta|caso|direito|direitos|indenizacao)\b/, 'fala do próprio caso'],
  [/\b(?:nao|nunca)\s+(?:me\s+)?(?:pagaram|pagou|querem|quer|deixam|deixa|aceitam|devolvem|devolveram|liberam|liberaram|cumpriram|cumpre|reembolsaram)\b/, 'relata descumprimento'],
  [/\bnao\s+consigo\s+(?:cancelar|receber|sacar|resolver|falar)\b/, 'relata descumprimento'],
  [/\b(?:negou|negaram|negado|negada|cancelaram|bloquearam|cortaram|suspenderam)\b/, 'relata negativa'],
  [/\b(?:quero|queria|preciso|gostaria\s+de|posso|como\s+faco\s+para)\s+(?:processar|entrar\s+com|abrir\s+(?:um\s+)?processo|cancelar\s+(?:o|meu|minha|a|esse|essa)|reclamar|saber\s+(?:se|sobre)|uma\s+consulta|agendar|marcar|falar\s+com\s+(?:a\s+)?(?:doutora|dra|advogad)|ajuda|orientacao)\b/, 'pede atendimento'],
  [/\b(?:voces|a\s+doutora|a\s+dra|o\s+escritorio|a\s+senhora)\s+(?:atende|atendem|trabalha|trabalham|faz|fazem|pega|pegam|cuida|cuidam|resolve|resolvem)\b/, 'pergunta se o escritório atende'],
  [/\brecebi\s+(?:uma|um)\s+(?:oferta|proposta|cobranca|notificacao|intimacao|carta|citacao|mensagem\s+de\s+cobranca)\b/, 'pergunta sobre algo que recebeu'],
  [/\b(?:tenho\s+direito|meus\s+direitos|e\s+legal\s+isso|isso\s+e\s+legal|pode\s+isso|e\s+golpe|sera\s+que\s+e\s+golpe)\b/, 'dúvida jurídica própria'],
];

/** Só o assunto (sem pedido nem problema próprio): não protege sozinho uma mensagem claramente comercial. */
const ASSUNTO_JURIDICO = /\b(?:golpe|fraude|procon|reclame\s+aqui|danos?\s+morais|indenizacao|demitid|acidente\s+de\s+trabalho|auxilio-?doenca|aposentadoria|pensao\s+alimenticia|divorcio|inventario|despejo|rescisao)\b/;

export function classificarMensagemComercial(texto: string, contexto: ContextoFiltroComercial): ClassificacaoComercial {
  const t = fold(texto);
  if (!t) return { resultado: 'atender', pontos: 0, sinaisComerciais: [], sinaisCliente: [] };
  let pontos = 0;
  const sinaisComerciais: string[] = [];
  for (const cat of CATEGORIAS) {
    const n = cat.sinais.filter(r => r.test(t)).length;
    if (!n) continue;
    pontos += Math.min(cat.maximo, cat.peso + (n - 1) * 2);
    sinaisComerciais.push(cat.nome);
  }
  // Link sozinho não é comercial; reforça quando já há intenção comercial.
  if (pontos > 0 && /https?:\/\/|www\.|\bbit\.ly\b/.test(t)) { pontos += /utm_|\bbit\.ly\b|wa\.me\/\d+\?text=/.test(t) ? 2 : 1; sinaisComerciais.push('link de divulgação'); }
  const sinaisCliente = [...new Set(CLIENTE.filter(([r]) => r.test(t)).map(([, s]) => s))];
  const assunto = ASSUNTO_JURIDICO.test(t);

  let resultado: ResultadoFiltroComercial;
  if (pontos === 0) resultado = 'atender';
  // Pedido ou problema próprio: atende; só uma mensagem muito comercial com esse traço vai para a equipe conferir.
  else if (sinaisCliente.length) resultado = pontos >= 8 ? 'duvida' : 'atender';
  else if (contexto.contatoConhecido) resultado = pontos >= 4 ? 'duvida' : 'atender';
  // Só o assunto jurídico (ex.: curso sobre aposentadoria): nunca ignorado sem a equipe ver.
  else if (assunto) resultado = pontos >= 3 ? 'duvida' : 'atender';
  else resultado = pontos >= 5 ? 'comercial' : pontos >= 3 ? 'duvida' : 'atender';
  return { resultado, pontos, sinaisComerciais, sinaisCliente: assunto ? [...sinaisCliente, 'assunto jurídico'] : sinaisCliente };
}

/** Contato já conhecido pelo escritório: nunca ignorado automaticamente. */
export function contextoFiltroComercial(c: Conversa, mensagemId: string): ContextoFiltroComercial {
  const a = c.agenteAna;
  const conversaComEscritorio = c.mensagens.some(m => m.id !== mensagemId && m.de === 'escritorio');
  return {
    contatoConhecido: conversaComEscritorio || !!c.consultaAgendada || !!c.contrato || c.etapa !== 'inicial' || (c.processos?.length ?? 0) > 0
      || c.tipoClienteAgenda === 'cadastrado' || !!a?.vinculoProjuris || !!a?.reservaCalendar || !!c.funilInternacional,
  };
}

/** Marca a mensagem, encerra a execução da Anne para ela e, na dúvida, avisa a equipe em silêncio. */
export function registrarFiltroComercial(c: Conversa, mensagemId: string, cls: ClassificacaoComercial, agora = new Date()): Conversa {
  if (cls.resultado === 'atender') return c;
  const em = agora.toISOString();
  const marca: NonNullable<Mensagem['filtroComercial']> = { resultado: cls.resultado, motivos: cls.sinaisComerciais.slice(0, 4), em };
  const marcada: Conversa = {
    ...c,
    mensagens: c.mensagens.map(m => m.id === mensagemId ? { ...m, filtroComercial: marca, ...(m.iaExecucao ? { iaExecucao: { ...m.iaExecucao, estado: 'concluida' as const } } : {}) } : m),
  };
  if (cls.resultado === 'comercial') return marcada;
  return registrarAviso(marcada, {
    id: `filtro-comercial:${mensagemId}`, tipo: 'triagem', criadoEm: em,
    texto: `Mensagem que parece comercial (${cls.sinaisComerciais.slice(0, 2).join(', ')}): a Anne não respondeu. Conferir se é cliente.`,
  }, false);
}

export const TEXTO_FILTRO: Record<'comercial' | 'duvida', string> = {
  comercial: 'Comunicação comercial: ignorada pela Anne',
  duvida: 'Parece comercial: a equipe confere (sem resposta da Anne)',
};
