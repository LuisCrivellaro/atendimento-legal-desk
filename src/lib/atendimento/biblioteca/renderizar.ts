import { IDS_TEMPLATES, TEMPLATES_OFICIAIS, TODAS_VARIAVEIS, variaveisDoTexto, variaveisPermitidas, type Ativacao, type IdTemplate } from './mensagens-oficiais';

/**
 * Renderização determinística da biblioteca oficial. A única mudança permitida no texto é trocar as variáveis entre
 * colchetes por valores reais e verificados; a conversão de Markdown para o WhatsApp não muda o conteúdo visível.
 * Nada aqui chama o modelo. Variável faltando, valor inválido ou modelo inativo → nada é gerado.
 */

/** Versão aprovada por sênior/admin (gravada só pelo servidor, com histórico). */
export interface VersaoMensagem {
  versao: number;
  texto: string;
  autor: string;
  em: string;
  motivo?: string | undefined;
}

/** Estado salvo da biblioteca na área de trabalho (`office_workspace.dados.bibliotecaMensagens`). */
export interface BibliotecaSalva {
  versoes?: Partial<Record<IdTemplate, VersaoMensagem[]>> | undefined;
  ativacao?: Partial<Record<IdTemplate, Ativacao>> | undefined;
  /** Versão comercial da consulta paga autorizada pela advogada (nunca escolhida pela Anne). */
  consultaPaga?: 'T07.2' | 'T07.3' | null | undefined;
  atualizadoEm?: string | undefined;
  atualizadoPor?: string | undefined;
}

const ATIVACOES: Ativacao[] = ['ativo', 'manual', 'aguardando_aprovacao'];

/** Texto de uma nova versão só pode usar as variáveis permitidas do modelo (nenhuma variável nova). */
export function versaoValida(id: IdTemplate, texto: string) {
  const permitidas = variaveisPermitidas(id);
  return texto.trim().length > 0 && texto.length <= 6000 && variaveisDoTexto(texto).every(v => permitidas.includes(v));
}

/** Lê o que está salvo sem confiar no conteúdo: id desconhecido, texto com variável nova ou estado inválido são ignorados. */
export function lerBiblioteca(salvo: unknown): BibliotecaSalva {
  const s = (salvo && typeof salvo === 'object' ? salvo : {}) as Record<string, unknown>;
  const v = (s['versoes'] && typeof s['versoes'] === 'object' ? s['versoes'] : {}) as Record<string, unknown>;
  const a = (s['ativacao'] && typeof s['ativacao'] === 'object' ? s['ativacao'] : {}) as Record<string, unknown>;
  const versoes: Partial<Record<IdTemplate, VersaoMensagem[]>> = {};
  for (const id of IDS_TEMPLATES) {
    const lista = Array.isArray(v[id]) ? (v[id] as unknown[]) : [];
    const validas = lista.filter((x): x is VersaoMensagem => !!x && typeof x === 'object' && typeof (x as VersaoMensagem).texto === 'string' && typeof (x as VersaoMensagem).versao === 'number' && versaoValida(id, (x as VersaoMensagem).texto))
      .map(x => ({ versao: x.versao, texto: x.texto, autor: String(x.autor ?? '').slice(0, 80), em: String(x.em ?? ''), ...(x.motivo ? { motivo: String(x.motivo).slice(0, 200) } : {}) }));
    if (validas.length) versoes[id] = validas.sort((x, y) => x.versao - y.versao).slice(-20);
  }
  const consultaPaga = s['consultaPaga'] === 'T07.2' || s['consultaPaga'] === 'T07.3' ? s['consultaPaga'] : null;
  const ativacao: Partial<Record<IdTemplate, Ativacao>> = {};
  for (const id of IDS_TEMPLATES) {
    const x = a[id];
    if (typeof x !== 'string' || !(ATIVACOES as string[]).includes(x)) continue;
    // Consulta paga: só a versão escolhida pela advogada pode ficar ativa.
    if ((id === 'T07.2' || id === 'T07.3') && x === 'ativo' && consultaPaga !== id) continue;
    ativacao[id] = x as Ativacao;
  }
  return { versoes, ativacao, consultaPaga, ...(typeof s['atualizadoEm'] === 'string' ? { atualizadoEm: s['atualizadoEm'] } : {}), ...(typeof s['atualizadoPor'] === 'string' ? { atualizadoPor: s['atualizadoPor'].slice(0, 80) } : {}) };
}

/** Texto e estado vigentes: última versão aprovada salva ou a versão oficial 1 do código. */
export function templateVigente(id: IdTemplate, biblioteca?: BibliotecaSalva) {
  const base = TEMPLATES_OFICIAIS[id];
  const ultima = biblioteca?.versoes?.[id]?.at(-1);
  const texto = ultima && versaoValida(id, ultima.texto) ? ultima.texto : base.texto;
  return { id, versao: ultima && texto === ultima.texto ? ultima.versao : base.versao, texto, ativacao: biblioteca?.ativacao?.[id] ?? base.ativacao };
}

/** Markdown → formatação nativa do WhatsApp, sem mudar o conteúdo visível (negrito, itálico, tachado). */
export function paraWhatsApp(texto: string) {
  return texto.replace(/\*\*([^*\n]+)\*\*/g, '*$1*').replace(/__([^_\n]+)__/g, '_$1_').replace(/~~([^~\n]+)~~/g, '~$1~');
}

/** Sobrou alguma variável oficial sem preencher (em qualquer texto)? */
export function variaveisPendentes(texto: string) {
  return variaveisDoTexto(texto).filter(v => TODAS_VARIAVEIS.includes(v));
}

export type Valores = Partial<Record<string, string | undefined>>;

export type Renderizacao =
  | { ok: true; id: IdTemplate; versao: number; texto: string }
  | { ok: false; id: IdTemplate; motivo: 'inativo' | 'variavel_ausente' | 'incompativel'; faltando?: string[] | undefined; detalhe?: string | undefined };

/** Valor aceito: não vazio, uma linha, sem colchetes (nunca reinsere uma variável) e sem quebrar o texto. */
function valorValido(v: string | undefined) {
  return !!v && v.trim().length > 0 && v.length <= 300 && !/[\[\]\r\n]/.test(v);
}

/**
 * Preenche o modelo vigente. `exigirAtivo` (padrão) impede uso automático de modelo manual ou aguardando aprovação.
 * `deixarPendentes` só serve para rascunhos de revisão humana: as variáveis sem dado ficam visíveis entre colchetes
 * e o envio continua bloqueado até alguém preenchê-las (ver `variaveisPendentes`).
 */
export function renderizarOficial(id: IdTemplate, valores: Valores, opcoes: { biblioteca?: BibliotecaSalva | undefined; exigirAtivo?: boolean; deixarPendentes?: boolean } = {}): Renderizacao {
  const t = templateVigente(id, opcoes.biblioteca);
  if ((opcoes.exigirAtivo ?? true) && t.ativacao !== 'ativo') return { ok: false, id, motivo: 'inativo', detalhe: `Modelo ${id} está "${t.ativacao}".` };
  const variaveis = variaveisDoTexto(t.texto);
  const faltando = variaveis.filter(v => !valorValido(valores[v]));
  if (faltando.length && !opcoes.deixarPendentes) return { ok: false, id, motivo: 'variavel_ausente', faltando };
  let texto = t.texto;
  for (const v of variaveis) if (valorValido(valores[v])) texto = texto.split(v).join((valores[v] ?? '').trim());
  return { ok: true, id, versao: t.versao, texto: paraWhatsApp(texto) };
}
