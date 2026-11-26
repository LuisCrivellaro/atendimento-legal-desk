import type { Conversa } from '../mock-data';
import { registrarAviso } from './avisos-equipe';
import { TEMPLATES_OFICIAIS, type IdTemplate } from './biblioteca/mensagens-oficiais';
import type { TipoEvento } from './acompanhamento';

/**
 * Registro estruturado das audiências e perícias de cada cliente (agenteAna.eventosProcessuais), puro e testável.
 * Ciclo: rascunho (T11.1/T12.1 na fila da revisora) → comunicado (aprovado e entregue com recibo; campos lidos do
 * texto aprovado) → lembretes/confirmações (T04, T11.2, T12.2, T12.3) só com modelo ativo, dados completos e
 * dentro da janela; redesignação ou cancelamento invalidam rascunho, aprovação pendente e lembretes antigos.
 * Nada aqui fala com o cliente: as decisões são executadas pelo monitor (`eventos-processuais.server.ts`).
 */

export type EstadoEvento = 'rascunho' | 'comunicado' | 'redesignado' | 'cancelado';

export interface EventoProcessual {
  chave: string;
  tipo: TipoEvento;
  codigoProcesso: number;
  /** dd/mm/aaaa e "14h30", só quando escritos no registro oficial. */
  data?: string | undefined;
  hora?: string | undefined;
  /** Tipo da perícia (médica, técnica...) quando escrito no registro. */
  tipoPericia?: string | undefined;
  estado: EstadoEvento;
  pedido: string;
  criadoEm: string;
  comunicadoEm?: string | undefined;
  /** Campos do texto aprovado pela revisora (ex.: [endereço completo], [presencial/online]). */
  campos?: Record<string, string> | undefined;
  enviados?: Partial<Record<IdTemplate, string>> | undefined;
  pendencias?: string[] | undefined;
  motivo?: string | undefined;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Movimento de cancelamento ou retirada de pauta (não é um evento novo). */
export function cancelamentoDoMovimento(texto: string): boolean {
  const t = fold(texto);
  return /\b(?:cancelad[ao]|cancelamento|desmarcad[ao]|retirad[ao] de pauta|sem efeito|nao (?:sera|vai ser) realizad[ao])\b/.test(t);
}

/** Tipo da perícia escrito no registro ("perícia médica"). Sem tipo, o T12.2 vira pendência. */
export function tipoDaPericia(texto: string): string | undefined {
  const m = /per[ií]cia\s+(m[eé]dica|t[eé]cnica|cont[aá]bil|psicol[oó]gica|social|grafot[eé]cnica|ergon[oô]mica|de insalubridade|de periculosidade)/i.exec(texto);
  return m?.[1]?.toLocaleLowerCase('pt-BR');
}

/** Data dd/mm/aaaa + hora "14h30" → instante (São Paulo, sem horário de verão). */
export function instanteEvento(e: Pick<EventoProcessual, 'data' | 'hora'>): number | undefined {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(e.data ?? '');
  if (!d) return undefined;
  const h = /^(\d{1,2})h(\d{2})?$/.exec(e.hora ?? '');
  const iso = `${d[3]}-${d[2]}-${d[1]}T${String(h ? Number(h[1]) : 0).padStart(2, '0')}:${h?.[2] ?? '00'}:00-03:00`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

function eventos(c: Pick<Conversa, 'agenteAna'>): EventoProcessual[] {
  return c.agenteAna?.eventosProcessuais ?? [];
}

function comEventos<T extends Conversa>(c: T, lista: EventoProcessual[]): T {
  return { ...c, agenteAna: { ...c.agenteAna, eventosProcessuais: lista.slice(-40) } };
}

/**
 * Novo rascunho de evento. Outro evento do mesmo tipo e processo ainda futuro (rascunho ou comunicado) com data
 * diferente vira "redesignado": aprovação pendente e lembretes dele deixam de valer, e a equipe é avisada.
 */
export function registrarEventoRascunho<T extends Conversa>(c: T, e: Omit<EventoProcessual, 'estado' | 'criadoEm'>, agora = new Date()): T {
  if (eventos(c).some(x => x.chave === e.chave)) return c;
  const stamp = agora.toISOString();
  let redesignados = 0;
  const lista = eventos(c).map(x => {
    const quando = instanteEvento(x);
    if (x.tipo !== e.tipo || x.codigoProcesso !== e.codigoProcesso || (x.estado !== 'rascunho' && x.estado !== 'comunicado') || (quando !== undefined && quando < agora.getTime())) return x;
    redesignados++;
    return { ...x, estado: 'redesignado' as const, motivo: `substituído pelo evento de ${e.data ?? 'data a confirmar'}${e.hora ? ` às ${e.hora}` : ''}` };
  });
  const comNovo = comEventos(c, [...lista, { ...e, estado: 'rascunho', criadoEm: stamp }]);
  if (!redesignados) return comNovo;
  const nome = e.tipo === 'audiencia' ? 'Audiência' : 'Perícia';
  return registrarAviso(comNovo, { id: `evento-redesignado:${e.chave}`, tipo: 'audiencia', prioridade: true, criadoEm: stamp, texto: `${nome} redesignada no ProJuris (${e.data ?? 'nova data a confirmar'}${e.hora ? ` às ${e.hora}` : ''}): rascunho/lembretes anteriores invalidados. Aprove só o novo rascunho (${e.pedido}).` }, false);
}

/** Cancelamento/retirada de pauta: eventos futuros do tipo e processo ficam cancelados (lembretes param). */
export function registrarEventoCancelado<T extends Conversa>(c: T, tipo: TipoEvento, codigoProcesso: number, agora = new Date()): T {
  let afetados = 0;
  const lista = eventos(c).map(x => {
    const quando = instanteEvento(x);
    if (x.tipo !== tipo || x.codigoProcesso !== codigoProcesso || (x.estado !== 'rascunho' && x.estado !== 'comunicado') || (quando !== undefined && quando < agora.getTime())) return x;
    afetados++;
    return { ...x, estado: 'cancelado' as const, motivo: 'cancelamento registrado no ProJuris' };
  });
  if (!afetados) return c;
  const nome = tipo === 'audiencia' ? 'Audiência' : 'Perícia';
  return registrarAviso(comEventos(c, lista), { id: `evento-cancelado:${codigoProcesso}:${tipo}:${agora.toISOString().slice(0, 10)}`, tipo: 'audiencia', prioridade: true, criadoEm: agora.toISOString(), texto: `${nome} cancelada/retirada de pauta no ProJuris: lembretes suspensos. Se o cliente já foi avisado, comunique o cancelamento (texto da equipe).` }, false);
}

/** O rascunho deste pedido ainda vale? (redesignado/cancelado não pode ser aprovado). */
export function eventoDoPedidoValido(c: Pick<Conversa, 'agenteAna'>, chave: string): { ok: true } | { ok: false; motivo: string } {
  const e = eventos(c).find(x => x.chave === chave);
  if (!e) return { ok: true };
  if (e.estado === 'redesignado') return { ok: false, motivo: 'Este evento foi redesignado no ProJuris: aprove o rascunho novo.' };
  if (e.estado === 'cancelado') return { ok: false, motivo: 'Este evento foi cancelado no ProJuris: nada deve ser enviado.' };
  return { ok: true };
}

/**
 * Lê os campos de um texto aprovado que segue o modelo oficial (mesma estrutura, valores no lugar das variáveis).
 * Texto corrigido fora da estrutura do modelo → undefined (os lembretes viram pendência, nada é presumido).
 */
export function extrairCampos(id: IdTemplate, texto: string): Record<string, string> | undefined {
  const modelo = TEMPLATES_OFICIAIS[id].texto;
  const vars: string[] = [];
  const padrao = modelo.split(/(\[[^\]\n]+\])/).map(p => {
    if (/^\[[^\]\n]+\]$/.test(p)) { vars.push(p); return '([\\s\\S]+?)'; }
    return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  const m = new RegExp(`^${padrao}$`).exec(texto.trim());
  if (!m) return undefined;
  const campos: Record<string, string> = {};
  vars.forEach((v, i) => { const valor = (m[i + 1] ?? '').trim(); if (valor && !/^\[[^\]]+\]$/.test(valor)) campos[v] = valor; });
  return campos;
}

/** Notícia do evento aprovada e entregue com recibo: campos do texto aprovado e estado "comunicado". */
export function registrarEventoComunicado<T extends Conversa>(c: T, chave: string, textoEntregue: string, agora = new Date()): T {
  const lista = eventos(c);
  const e = lista.find(x => x.chave === chave);
  if (!e || e.estado === 'redesignado' || e.estado === 'cancelado') return c;
  const campos = extrairCampos(e.tipo === 'audiencia' ? 'T11.1' : 'T12.1', textoEntregue);
  return comEventos(c, lista.map(x => x.chave === chave ? { ...x, estado: 'comunicado' as const, comunicadoEm: agora.toISOString(), ...(campos ? { campos } : {}) } : x));
}

export interface ConfigEventos {
  /** Dias antes da audiência presencial para o T04 (decisão da equipe; padrão 1 = véspera). */
  diasLembreteAudiencia: number;
  /** Dias antes para pedir confirmação de recebimento (T11.2/T12.3); null = não pedir (regra ainda não definida). */
  diasConfirmacaoEvento: number | null;
  /** Orientação de antecedência aprovada pela Dra. para o T11.2 ([antecedência]); sem ela o T11.2 não sai. */
  antecedenciaAudiencia: string | null;
}

export const CONFIG_EVENTOS_PADRAO: ConfigEventos = { diasLembreteAudiencia: 1, diasConfirmacaoEvento: null, antecedenciaAudiencia: null };

export type AcaoEvento = { chave: string; modelo: IdTemplate; valores: Record<string, string | undefined> } | { chave: string; pendencia: string; id: string };

function diaSP(ms: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms));
}

/**
 * Lembretes devidos agora para eventos comunicados (puro). `diaUtil(iso)` vem do calendário oficial (feriados
 * nacionais). Só em dia útil das 9h às 18h; a palavra "amanhã" do T12.2 nunca é adaptada: se a véspera não é dia útil,
 * vira pendência antecipada para a equipe no último dia útil antes da véspera.
 */
export function decidirLembretesEventos(c: Pick<Conversa, 'agenteAna' | 'nome'>, agora: Date, cfg: ConfigEventos, diaUtil: (diaIso: string) => boolean, nomeCliente: string | undefined): AcaoEvento[] {
  const acoes: AcaoEvento[] = [];
  const hoje = diaSP(agora.getTime());
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora));
  const expediente = diaUtil(hoje) && hora >= 9 && hora < 18;
  const DIA = 86400000;
  for (const e of eventos(c)) {
    if (e.estado !== 'comunicado') continue;
    const quando = instanteEvento(e);
    if (quando === undefined || quando <= agora.getTime()) continue;
    const diaEvento = diaSP(quando);
    const ja = (m: IdTemplate) => !!e.enviados?.[m];
    const pend = (id: string) => e.pendencias?.includes(id);
    const campos = e.campos ?? {};
    if (e.tipo === 'pericia' && !ja('T12.2')) {
      const vespera = diaSP(quando - DIA);
      if (hoje === vespera) {
        if (expediente) acoes.push({ chave: e.chave, modelo: 'T12.2', valores: { '[tipo de perícia]': e.tipoPericia, '[data]': e.data, '[horário]': campos['[horário]'] ?? e.hora, '[endereço completo]': campos['[endereço completo]'] } });
      } else if (!diaUtil(vespera) && hoje < vespera && quando - agora.getTime() <= 4 * DIA && expediente && !pend('vespera-nao-util')) {
        acoes.push({ chave: e.chave, id: 'vespera-nao-util', pendencia: `A véspera da perícia de ${e.data} (${vespera.split('-').reverse().join('/')}) não é dia útil: o lembrete oficial T12.2 ("amanhã") não pode sair no dia certo. Avisar o cliente manualmente.` });
      }
    }
    if (e.tipo === 'audiencia' && !ja('T04') && /presencial/i.test(campos['[presencial/online]'] ?? '')) {
      const alvo = diaSP(quando - cfg.diasLembreteAudiencia * DIA);
      if (hoje >= alvo && hoje < diaEvento && expediente) acoes.push({ chave: e.chave, modelo: 'T04', valores: { '[nome do cliente]': nomeCliente, '[data]': campos['[data]'] ?? e.data, '[horário]': campos['[horário]'] ?? e.hora, '[tipo da audiência / modalidade]': campos['[tipo de audiência]'] ? `${campos['[tipo de audiência]']} / ${campos['[presencial/online]']}` : undefined, '[número do processo]': campos['[número]'], '[vara responsável]': campos['[vara responsável]'], '[Endereço completo]': campos['[Endereço ou link]'] } });
    }
    if (cfg.diasConfirmacaoEvento !== null) {
      const alvo = diaSP(quando - cfg.diasConfirmacaoEvento * DIA);
      const devido = hoje >= alvo && hoje < diaEvento && expediente;
      if (devido && e.tipo === 'audiencia' && !ja('T11.2')) acoes.push({ chave: e.chave, modelo: 'T11.2', valores: { '[nome]': nomeCliente, '[data]': campos['[data]'] ?? e.data, '[horário]': campos['[horário]'] ?? e.hora, '[tipo da audiência]': campos['[tipo de audiência]'], '[presencial/online]': campos['[presencial/online]'], '[endereço]': campos['[Endereço ou link]'], '[número]': campos['[número]'], '[antecedência]': cfg.antecedenciaAudiencia ?? undefined } });
      if (devido && e.tipo === 'pericia' && !ja('T12.3')) acoes.push({ chave: e.chave, modelo: 'T12.3', valores: { '[nome]': nomeCliente, '[data]': campos['[data]'] ?? e.data, '[horário]': campos['[horário]'] ?? e.hora, '[endereço completo]': campos['[endereço completo]'] } });
    }
  }
  return acoes;
}

/** Reserva (antes do envio) e registro do lembrete do evento: nunca sai duas vezes. */
export function marcarEnvioEvento<T extends Conversa>(c: T, chave: string, modelo: IdTemplate, agora = new Date()): T {
  return comEventos(c, eventos(c).map(x => x.chave === chave ? { ...x, enviados: { ...x.enviados, [modelo]: agora.toISOString() } } : x));
}

export function marcarPendenciaEvento<T extends Conversa>(c: T, chave: string, id: string): T {
  return comEventos(c, eventos(c).map(x => x.chave === chave ? { ...x, pendencias: [...new Set([...(x.pendencias ?? []), id])] } : x));
}

/** Eventos futuros comunicados (para o painel). */
export function eventosFuturos(c: Pick<Conversa, 'agenteAna'>, agora = new Date()) {
  return eventos(c).filter(e => (e.estado === 'comunicado' || e.estado === 'rascunho') && (instanteEvento(e) ?? Infinity) > agora.getTime());
}
