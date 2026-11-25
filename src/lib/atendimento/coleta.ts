import type { Conversa } from '../mock-data';
import { feriadoNacional } from './schedule-rules';

/**
 * Concierge de coleta (P0-3): depois do "Trato feito", acompanha contrato e documentos pelo checklist real.
 * Regras puras; a rotina do servidor (coleta.server.ts) e a Anne (ana.server.ts) só executam as decisões.
 */

/** D3 (fallback, 25/11/2026): no máximo 3 lembretes por pendência; depois, aviso à equipe. */
export const LIMITE_LEMBRETES_COLETA = 3;
export const INTERVALO_LEMBRETE_CONTRATO_MS = 24 * 3600_000;
export const INTERVALO_LEMBRETE_FALTANTES_MS = 48 * 3600_000;

/**
 * Textos propostos (não oficiais) da coleta. Editáveis em Mensagens prontas pelos mesmos ids;
 * o servidor usa a versão salva pela equipe quando existir.
 */
export const TEXTOS_COLETA = {
  recebido: { id: 'proposta-coleta-recebido', texto: 'Recebi o seu arquivo, obrigada! 😊\nA equipe vai conferir.\n\nAinda faltam:\n{documentos_faltantes}' },
  recebidoCompleto: { id: 'proposta-coleta-recebido-completo', texto: 'Recebi o seu arquivo, obrigada! 😊\nA equipe vai conferir e, se precisar de mais alguma coisa, te avisamos por aqui.' },
  lembreteContrato: { id: 'proposta-coleta-contrato', texto: 'Oi, {nome}! Tudo bem? 😊\nPassando para lembrar que o contrato ainda aguarda a sua assinatura:\n{link}\nSe tiver qualquer dificuldade, é só me chamar por aqui.' },
  lembreteFaltantes: { id: 'proposta-coleta-faltantes', texto: 'Oi, {nome}! Tudo bem? 😊\nPara darmos andamento ao seu caso, ainda precisamos de:\n{documentos_faltantes}\nPode enviar por aqui mesmo, quando puder.' },
} as const;

export type ChaveTextoColeta = keyof typeof TEXTOS_COLETA;

/** Preenche os campos com dados reais; nunca deixa campo vazio sem dado. */
export function preencherColeta(texto: string, dados: { nome?: string | undefined; link?: string | undefined; faltantes?: string[] | undefined }) {
  const primeiro = (dados.nome ?? '').trim().split(/\s+/)[0] ?? '';
  const n = primeiro ? primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR') : '';
  let t = n ? texto.replaceAll('{nome}', n) : texto.replace(/,? ?\{nome\}/g, '');
  if (dados.link) t = t.replaceAll('{link}', dados.link);
  if (dados.faltantes) t = t.replaceAll('{documentos_faltantes}', dados.faltantes.map(f => `• ${f}`).join('\n'));
  return t;
}

/** Conversa em fase de coleta: Trato feito registrado ou etapa de documentos. */
export function emColeta(c: Pick<Conversa, 'etapa' | 'timeline'>) {
  return c.etapa === 'documentos' || (c.timeline ?? []).some(t => t.evento.startsWith('Trato feito'));
}

/** Dia útil (seg–sex, sem feriado nacional), das 9h às 17h30 em São Paulo. */
export function expedienteColeta(agora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora).map(x => [x.type, x.value]));
  const data = `${p['year']}-${p['month']}-${p['day']}`;
  const dia = new Date(`${data}T12:00:00Z`).getUTCDay();
  const minutos = Number(p['hour']) * 60 + Number(p['minute']);
  return dia >= 1 && dia <= 5 && !feriadoNacional(data) && minutos >= 9 * 60 && minutos <= 17 * 60 + 30;
}

/** Pergunta de avaliação do documento ("serve?", "está certo?", "o que é isso?"): sempre com a equipe. */
export function perguntaAvaliacaoDocumento(texto: string) {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Inequívocas mesmo sem "?".
  if (/\b(?:serve|servem|esta legivel|ta legivel|da pra ler|da para ler|e suficiente|precisa de mais|o que e isso|o que e esse|qual documento e esse)\b/.test(t)) return true;
  // "Tá certo", "ficou bom"… também são "ok" no dia a dia: só contam como pergunta com "?".
  return /\?/.test(t) && /\b(?:serviu|esta certo|ta certo|ta bom assim|esta bom assim|ficou bom|esta correto|ta correto|esta ok|ta ok)\b/.test(t);
}

/** Link de demonstração gravado pelo fluxo antigo (simulado): nunca é enviado ao cliente. */
export function linkContratoDemonstracao(link: string | undefined) {
  return !!link && /(?:zapsign\.com\.br|mpago\.la|meet\.google\.com)\/demo(?:[/?#-]|$)/i.test(link);
}

/** Primeiro lembrete só para pedido recente: pendências antigas (de antes da rotina) nunca disparam em massa. */
export const JANELA_PRIMEIRO_LEMBRETE_MS = 7 * 86400_000;

/**
 * Resposta da Anne a um anexo recebido na coleta. Só diz que recebeu com recibo do servidor (arquivo guardado);
 * lista os faltantes pelos nomes do checklist; avaliação do documento fica com a equipe.
 */
export function respostaDocumentoColeta(e: { temRecibo: boolean; faltantes: string[]; textoCliente: string; textos?: Partial<Record<ChaveTextoColeta, string>> }) {
  const avaliacao = perguntaAvaliacaoDocumento(e.textoCliente);
  if (!e.temRecibo) return { mensagem: 'Vou pedir para a equipe conferir o arquivo que você enviou e te retornamos por aqui.', humano: true, proximo: 'Anexo sem recibo de armazenamento: equipe conferir o arquivo no WhatsApp; a Anne não confirmou recebimento.' };
  const base = e.faltantes.length
    ? preencherColeta(e.textos?.recebido ?? TEXTOS_COLETA.recebido.texto, { faltantes: e.faltantes })
    : e.textos?.recebidoCompleto ?? TEXTOS_COLETA.recebidoCompleto.texto;
  if (avaliacao) return { mensagem: `${base}\n\nSobre a sua pergunta, quem confere se o documento atende é a equipe; te retornamos por aqui.`, humano: true, proximo: 'Cliente perguntou se o documento serve: equipe avaliar e responder.' };
  return { mensagem: base, humano: false, proximo: e.faltantes.length ? `Documento recebido; faltam ${e.faltantes.length} item(ns) do checklist.` : 'Documento recebido; checklist sem pendências. Equipe confere.' };
}

export interface EstadoLembretesColeta {
  contrato?: { link: string; enviados: number; ultimoEm?: string | undefined; avisadoEm?: string | undefined } | undefined;
  itens?: Record<string, { enviados: number; avisadoEm?: string | undefined }> | undefined;
  ultimoFaltantesEm?: string | undefined;
}

export interface EntradaLembretesColeta {
  contrato?: Conversa['contrato'];
  contratoLink?: string | undefined;
  contratoEnviadoEm?: string | undefined;
  emColeta: boolean;
  faltantes: string[];
  ultimoPedidoDocumentos?: string | undefined;
  estado?: EstadoLembretesColeta | undefined;
  automacoes: { contrato: boolean; faltantes: boolean };
}

export type DecisaoColeta =
  | { tipo: 'contrato'; link: string; numero: number }
  | { tipo: 'faltantes'; itens: string[] }
  | { tipo: 'limite'; pendencia: 'contrato' | 'faltantes'; itens: string[] };

/** O que vence agora, sem efeitos. Lembretes só em expediente; avisos de limite a qualquer hora. */
export function decidirLembretesColeta(e: EntradaLembretesColeta, agora = new Date()): DecisaoColeta[] {
  const out: DecisaoColeta[] = [];
  const expediente = expedienteColeta(agora);
  const vencido = (desde: string | undefined, intervalo: number) => !!desde && Number.isFinite(Date.parse(desde)) && Date.parse(desde) + intervalo <= agora.getTime();
  const recente = (desde: string | undefined) => !!desde && Number.isFinite(Date.parse(desde)) && agora.getTime() - Date.parse(desde) <= JANELA_PRIMEIRO_LEMBRETE_MS;
  if (e.automacoes.contrato && (e.contrato === 'enviado' || e.contrato === 'visualizado') && e.contratoLink && /^https:\/\//.test(e.contratoLink) && !linkContratoDemonstracao(e.contratoLink)) {
    const est = e.estado?.contrato?.link === e.contratoLink ? e.estado.contrato : undefined;
    const enviados = est?.enviados ?? 0;
    if (enviados >= LIMITE_LEMBRETES_COLETA) { if (!est?.avisadoEm) out.push({ tipo: 'limite', pendencia: 'contrato', itens: [] }); }
    else if (expediente && (est || recente(e.contratoEnviadoEm)) && vencido(est?.ultimoEm ?? e.contratoEnviadoEm, INTERVALO_LEMBRETE_CONTRATO_MS)) out.push({ tipo: 'contrato', link: e.contratoLink, numero: enviados + 1 });
  }
  if (e.automacoes.faltantes && e.emColeta && e.faltantes.length) {
    const contagem = (n: string) => e.estado?.itens?.[n]?.enviados ?? 0;
    const esgotados = e.faltantes.filter(n => contagem(n) >= LIMITE_LEMBRETES_COLETA && !e.estado?.itens?.[n]?.avisadoEm);
    if (esgotados.length) out.push({ tipo: 'limite', pendencia: 'faltantes', itens: esgotados });
    const elegiveis = e.faltantes.filter(n => contagem(n) < LIMITE_LEMBRETES_COLETA);
    const desde = [e.ultimoPedidoDocumentos, e.estado?.ultimoFaltantesEm].filter((x): x is string => !!x && Number.isFinite(Date.parse(x))).sort().at(-1);
    // Primeira vez: o pedido de documentos precisa ser recente; depois, a cadência segue o último lembrete.
    const comecou = !!e.estado?.ultimoFaltantesEm || recente(e.ultimoPedidoDocumentos);
    if (expediente && comecou && elegiveis.length && vencido(desde, INTERVALO_LEMBRETE_FALTANTES_MS)) out.push({ tipo: 'faltantes', itens: elegiveis });
  }
  return out;
}

/** Marca a decisão no estado antes do envio (reserva): conta o lembrete mesmo se o envio falhar depois. */
export function registrarLembreteColeta(estado: EstadoLembretesColeta | undefined, d: DecisaoColeta, agora = new Date()): EstadoLembretesColeta {
  const stamp = agora.toISOString();
  const atual = estado ?? {};
  if (d.tipo === 'contrato') {
    const prev = atual.contrato?.link === d.link ? atual.contrato : undefined;
    return { ...atual, contrato: { link: d.link, enviados: (prev?.enviados ?? 0) + 1, ultimoEm: stamp, ...(prev?.avisadoEm ? { avisadoEm: prev.avisadoEm } : {}) } };
  }
  if (d.tipo === 'faltantes') {
    const itens = { ...(atual.itens ?? {}) };
    for (const n of d.itens) itens[n] = { ...(itens[n] ?? { enviados: 0 }), enviados: (itens[n]?.enviados ?? 0) + 1 };
    return { ...atual, itens, ultimoFaltantesEm: stamp };
  }
  if (d.pendencia === 'contrato') return { ...atual, ...(atual.contrato ? { contrato: { ...atual.contrato, avisadoEm: stamp } } : {}) };
  const itens = { ...(atual.itens ?? {}) };
  for (const n of d.itens) itens[n] = { ...(itens[n] ?? { enviados: LIMITE_LEMBRETES_COLETA }), avisadoEm: stamp };
  return { ...atual, itens };
}
