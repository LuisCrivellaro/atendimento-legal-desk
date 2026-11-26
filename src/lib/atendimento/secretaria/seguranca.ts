/**
 * Camadas determinísticas contra alucinação e manipulação (além do prompt):
 * - conferência de fatos: horários, datas, valores, números de processo e CPF na mensagem de saída precisam
 *   existir numa fonte verificada desta conversa (agenda com recibo, mensagens já registradas, regras da agenda);
 *   isso também impede que dado de outro cliente apareça aqui;
 * - instruções dirigidas à IA dentro de mensagens do cliente (prompt injection) são tratadas como não confiáveis;
 * - pedidos de orientação jurídica, resultado ou honorários ficam com a equipe.
 * Nada aqui usa a confiança do próprio modelo.
 */
import type { Conversa } from '../../mock-data';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const INJECAO = [
  /\b(?:ignore|ignora|ignorar|ignorem|desconsidere|desconsidera|desconsiderar|esqueca|esquecer|esquece)\s+(?:todas?\s+|tod[oa]s\s+)?(?:as\s+|os\s+|suas\s+|seus\s+|essas\s+|estas\s+)?(?:instruc|regras|orientac|prompt|comandos|diretrizes|restric)/,
  /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:previous|prior|above)?\s*(?:instructions|rules|prompt)/,
  /\b(?:system\s*prompt|prompt\s+do\s+sistema|prompt\s+de\s+sistema|developer\s+mode|modo\s+desenvolvedor|jailbreak|modo\s+dan)\b/,
  /\b(?:voce\s+agora\s+e|a\s+partir\s+de\s+agora\s+voce\s+(?:e|sera|vai)|finja\s+que\s+voce|you\s+are\s+now|act\s+as\s+(?:an?\s+)?(?:ai|assistant|admin))\b/,
  /<\s*\/?\s*(?:system|assistant|instructions?|developer)\s*>/,
  /\b(?:revele|revela|mostre|mostra|me\s+(?:de|da|passe|passa|envie|manda))\s+(?:o\s+|a\s+|seu\s+|sua\s+|suas\s+|seus\s+)?(?:prompt|instruc|regras\s+internas|chave|token|api\s*key|senha\s+do\s+sistema)/,
];

/** Texto com instruções dirigidas à IA. Mensagens comuns ("esqueça o que eu disse, prefiro sexta") não entram. */
export function possivelInjecao(texto: string) {
  const t = fold(texto);
  return INJECAO.some(r => r.test(t));
}

const FORA_DO_ESCOPO = /\b(?:vou|vamos|eu\s+vou)\s+ganhar\b|\bchances?\s+de\s+(?:ganhar|vitoria|exito|sucesso)\b|\bquanto\s+(?:eu\s+)?(?:vou|irei)\s+receber\b|\bgarant(?:e|ia|ir)\s+(?:que|de|o\s+resultado)\b|\b(?:qual|quais)\s+(?:e|sao)?\s*(?:o|os)?\s*meus?\s+direitos?\b|\btenho\s+direito\b|\bhonorari|\bo\s+que\s+(?:eu\s+)?(?:devo|preciso)\s+fazer\s+(?:no|com\s+o|sobre\s+o)\s+processo\b|\bo\s+que\s+significa\s+(?:essa|esta|a)\s+(?:decisao|sentenca|movimentacao)\b/;

/** Pedido de orientação jurídica, resultado ou honorários: nunca respondido pela camada operacional. */
export function pedidoForaDoEscopo(texto: string) {
  return FORA_DO_ESCOPO.test(fold(texto));
}

export interface FontesVerificadas {
  /** Horários ISO confirmados (oferta da agenda oficial, consulta com recibo). */
  horarios: string[];
  /** Textos já registrados nesta conversa ou regras oficiais (mensagens do escritório, do cliente, regras da agenda). */
  textos: string[];
}

function partesSP(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return undefined;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { data: `${p['day']}/${p['month']}`, hora: `${p['hour']}:${p['minute']}` };
}

const dois = (n: number) => String(n).padStart(2, '0');

interface Fato { categoria: 'horario' | 'data' | 'valor' | 'processo' | 'cpf' | 'percentual' | 'link'; chave: string }

/** Links (com ou sem protocolo para os domínios usuais de reunião/assinatura/mensagem) normalizados para comparação. */
const LINK = /\b(?:https?:\/\/[^\s<>"'()]+|(?:meet\.google\.com|wa\.me|zoom\.us|app\.zapsign\.com\.br)\/[^\s<>"'()]+)/g;
const chaveLink = (u: string) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[.,;:!?…]+$/, '').replace(/\/+$/, '');

/** Extrai os fatos verificáveis de um texto em forma normalizada. */
export function extrairFatos(texto: string): Fato[] {
  const fatos: Fato[] = [];
  // Links primeiro (antes de minúsculas/acentos e dos padrões de data/horário que poderiam casar dentro da URL).
  const semLinks = texto.replace(LINK, m => { fatos.push({ categoria: 'link', chave: chaveLink(m).toLowerCase() }); return ' '; });
  const t = fold(semLinks);
  const semProcessos = t.replace(/\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/g, m => { fatos.push({ categoria: 'processo', chave: m.replace(/\D/g, '') }); return ' '; });
  const semCpf = semProcessos.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, m => { fatos.push({ categoria: 'cpf', chave: m.replace(/\D/g, '') }); return ' '; });
  const semValores = semCpf.replace(/r\$\s?\d[\d.]*(?:,\d{1,2})?/g, m => { fatos.push({ categoria: 'valor', chave: m.replace(/[^\d,]/g, '').replace(/,00$/, '') }); return ' '; });
  const semPercentuais = semValores.replace(/\b\d+(?:,\d+)?\s?%/g, m => { fatos.push({ categoria: 'percentual', chave: m.replace(/\s/g, '') }); return ' '; });
  const semDatas = semPercentuais.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g, (m, d: string, mes: string) => { const dia = Number(d), mm = Number(mes); if (dia >= 1 && dia <= 31 && mm >= 1 && mm <= 12) fatos.push({ categoria: 'data', chave: `${dois(dia)}/${dois(mm)}` }); return ' '; });
  for (const m of semDatas.matchAll(/\b(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?![\d])/g)) {
    const h = Number(m[1]), min = Number(m[2] ?? m[3] ?? 0);
    if (h <= 23 && min <= 59) fatos.push({ categoria: 'horario', chave: `${dois(h)}:${dois(min)}` });
  }
  return fatos;
}

/**
 * Fontes desta conversa (nunca de outra): horários com recibo ou oferecidos pela agenda oficial, mensagens já
 * registradas (escritório e cliente) e textos oficiais extras (regras da agenda, modelos fixos).
 */
export function fontesDaConversa(c: Pick<Conversa, 'consultaAgendada' | 'agenteAna' | 'horariosOfertados' | 'mensagens'> & { contratoLink?: string | undefined }, extras: { horarios?: (string | undefined)[]; textos?: string[] } = {}): FontesVerificadas {
  const a = c.agenteAna;
  const horarios = [c.consultaAgendada, a?.reservaCalendar?.inicio, a?.horarioPendente, ...(a?.horariosTeste ?? []), ...(a?.horariosApresentados ?? []), ...(c.horariosOfertados ?? []), ...(extras.horarios ?? [])].filter((x): x is string => !!x && Number.isFinite(Date.parse(x)));
  // Links só de recibos reais (reunião da reserva, contrato enviado) e das mensagens já registradas.
  const links = [a?.reservaCalendar?.meetUrl, a?.reservaCalendar?.url, c.contratoLink].filter((x): x is string => !!x && /^https:\/\//.test(x));
  return { horarios: [...new Set(horarios)], textos: [...c.mensagens.map(m => m.texto ?? ''), ...links, ...(extras.textos ?? [])] };
}

/** Links oficiais da biblioteca (site, Instagram, LinkedIn): fonte verificada para a resposta conversacional. */
export function linksOficiais(textos: string[]): string[] {
  return textos.flatMap(t => [...t.matchAll(LINK)].map(m => m[0]));
}

/**
 * Fatos da mensagem que não aparecem em nenhuma fonte verificada. Devolve só categoria e chave mascarada
 * (sem CPF ou número de processo por extenso), adequada para log e aviso à equipe.
 */
export function dadosNaoVerificados(texto: string, fontes: FontesVerificadas): string[] {
  const permitidos = new Set<string>();
  for (const iso of fontes.horarios) {
    const p = partesSP(iso), fim = partesSP(new Date(Date.parse(iso) + 30 * 60000).toISOString());
    if (p) { permitidos.add(`data:${p.data}`); permitidos.add(`horario:${p.hora}`); }
    if (fim) permitidos.add(`horario:${fim.hora}`);
  }
  for (const f of fontes.textos.flatMap(extrairFatos)) permitidos.add(`${f.categoria}:${f.chave}`);
  const faltando = extrairFatos(texto).filter(f => !permitidos.has(`${f.categoria}:${f.chave}`));
  return [...new Set(faltando.map(f => f.categoria === 'cpf' || f.categoria === 'processo' ? `${f.categoria} ••••${f.chave.slice(-4)}` : `${f.categoria} ${f.chave}`))];
}
