import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { CompromissoPJ } from '../projuris/agenda';
import { registrarAviso } from './avisos-equipe';
import { aplicarNovoHorario, aplicarVinculo, planejarSincronizacao, type ConversaAgenda } from './sincronizacao-agenda';
import { avisarRegistroPendente, aguardaRegistro, retomarPorAgenda, suspenderPorAgenda } from './situacao-consulta';
import { dataOficial, horarioOficial } from './biblioteca/selecao';
import { ID_MONITOR, INTERVALO_MONITOR_MIN, resumoSeguro, type EstadoMonitor, type ResultadoEtapa } from './monitor-estado';

export { ID_MONITOR, type EstadoMonitor, type ResultadoEtapa } from './monitor-estado';

/**
 * Monitor operacional central da Anne: uma única rotina do servidor (rota `monitorar-ana`, a cada 5 minutos) que
 * executa todas as automações, sem navegador aberto nem usuário conectado, e grava o resultado de cada etapa em
 * `ana_monitoramento` (id `monitor-operacional`) para o painel de Automações. Cada etapa é isolada: a falha de uma
 * não impede as outras; tudo é idempotente (reservas antes do envio), então execuções repetidas não duplicam nada.
 */

type Db = SupabaseClient<Database>;

const ORCAMENTO_MS = 45000;
const HISTORICO = 24;

function horaSP(agora: Date) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora));
}

export interface PortasAgendaMonitor {
  listar?: (inicioMs: number, fimMs: number) => Promise<CompromissoPJ[]>;
  situacao?: (codigo: number) => Promise<'ativo' | 'concluido' | 'ausente' | 'erro'>;
}

/**
 * Sincroniza as consultas das conversas com a agenda oficial. Falha do ProJuris não muda nada (próximo ciclo).
 * Compromisso concluído/inexistente (conferido pelo código) antes do horário suspende as automações para a equipe
 * conferir; nunca vira "cancelada", "realizada" ou "ausência" sozinho.
 */
export async function sincronizarConsultasProjuris(db: Db, agora = new Date(), portas: PortasAgendaMonitor = {}) {
  const vazio = () => ({ vinculadas: 0, atualizadas: 0, suspensas: 0, retomadas: 0, pendencias: [] as EstadoMonitor['pendenciasAgenda'], erro: undefined as string | undefined });
  const contatos = await db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado');
  if (contatos.error) throw new Error('Contatos indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  if (!porConversa.size) return { ok: true, ...vazio() };
  const rows = await db.from('casos').select('id,owner_id,dados,updated_at').in('id', [...porConversa.keys()]);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  const conversas: ConversaAgenda[] = rows.data.map(r => ({ id: r.id, conversa: r.dados as unknown as Conversa, contato: porConversa.get(r.id) }));
  const atualizadas = new Map(rows.data.map(r => [r.id, (r as { updated_at?: string }).updated_at ?? '']));
  const listar = portas.listar ?? (async (i: number, f: number) => (await import('../projuris/agenda.server')).listarCompromissos(i, f));
  const situacao = portas.situacao ?? (async (codigo: number) => (await import('../projuris/agenda.server')).situacaoCompromisso(codigo));
  let compromissos: CompromissoPJ[];
  try { compromissos = await listar(agora.getTime() - 2 * 3600000, agora.getTime() + 15 * 86400000); }
  catch { return { ok: false, ...vazio(), erro: 'Agenda do ProJuris indisponível; nada foi alterado.' }; }
  const { atualizarConversa } = await import('./ana.server');
  const resultado = { ok: true, ...vazio() };
  for (const acao of planejarSincronizacao(compromissos, conversas, agora)) {
    if (acao.tipo === 'vincular') {
      let feito = false;
      await atualizarConversa(db, acao.conversaId, x => {
        feito = false;
        const atual = x.consultaAgendada;
        if (atual && Date.parse(atual) > agora.getTime() && Date.parse(atual) !== acao.compromisso.inicioMs) return x;
        if (x.agenteAna?.reservaCalendar?.id === `pj:${acao.compromisso.codigo}`) return x;
        feito = true;
        return aplicarVinculo(x, acao.compromisso, acao.evidencia, agora);
      });
      if (feito) resultado.vinculadas++;
    } else if (acao.tipo === 'atualizar_horario') {
      await atualizarConversa(db, acao.conversaId, x => x.agenteAna?.reservaCalendar?.id === `pj:${acao.compromisso.codigo}` ? aplicarNovoHorario(x, acao.compromisso, agora) : x);
      resultado.atualizadas++;
    } else if (acao.tipo === 'verificar_cancelamento') {
      // Concluído/inexistente não prova cancelamento: antes do horário, suspende e pede conferência; erro não muda nada.
      const s = await situacao(acao.codigo);
      if (s !== 'concluido' && s !== 'ausente') continue;
      let suspensa = false;
      await atualizarConversa(db, acao.conversaId, x => {
        suspensa = false;
        if (x.agenteAna?.reservaCalendar?.id !== `pj:${acao.codigo}` || !x.consultaAgendada) return x;
        const y = suspenderPorAgenda(x, s === 'concluido' ? 'compromisso concluído no ProJuris antes do horário' : 'compromisso não encontrado no ProJuris', agora);
        suspensa = y !== x;
        return y;
      });
      if (suspensa) resultado.suspensas++;
    } else if (acao.tipo === 'retomar') {
      await atualizarConversa(db, acao.conversaId, x => x.agenteAna?.reservaCalendar?.id === `pj:${acao.compromisso.codigo}` ? retomarPorAgenda(x, agora) : x);
      resultado.retomadas++;
    } else {
      const quando = new Date(acao.compromisso.inicioMs).toISOString();
      resultado.pendencias.push({ quando, titulo: acao.compromisso.titulo.slice(0, 80), motivo: acao.motivo });
      // Reserva órfã: só avisa na conversa se ela não mudou nos últimos 10 min (evita alarme falso durante uma reserva em curso).
      const alteradaEm = Date.parse(atualizadas.get(acao.conversaId ?? '') ?? '');
      const recente = !!acao.reconciliacao && Number.isFinite(alteradaEm) && agora.getTime() - alteradaEm < 10 * 60000;
      if (acao.conversaId && !recente) await atualizarConversa(db, acao.conversaId, x => registrarAviso(x, { id: `agenda-pendencia:${acao.compromisso.codigo}`, tipo: 'projuris', prioridade: !!acao.reconciliacao, criadoEm: agora.toISOString(), texto: acao.reconciliacao ? `Compromisso no ProJuris em ${dataOficial(quando)} às ${horarioOficial(quando)}: ${acao.motivo}.` : `Compromisso no ProJuris em ${dataOficial(quando)} às ${horarioOficial(quando)} parece deste cliente, mas ${acao.motivo}: conferir antes de qualquer automação.` }, false));
    }
  }
  return resultado;
}

/** Consultas que já passaram sem registro de realizada/ausência: um aviso por consulta (nada é presumido). */
export async function avisarRegistrosPendentes(db: Db, agora = new Date()) {
  const lista = await db.from('casos').select('id,consulta:dados->>consultaAgendada').not('dados->>consultaAgendada', 'is', null);
  if (lista.error) throw new Error('Consultas indisponíveis.');
  const ids = ((lista.data ?? []) as unknown as { id: string; consulta: string | null }[])
    .filter(r => r.consulta && Date.parse(r.consulta) < agora.getTime() - 90 * 60000 && Date.parse(r.consulta) > agora.getTime() - 7 * 86400000).map(r => r.id);
  if (!ids.length) return { avisos: 0 };
  const rows = await db.from('casos').select('id,dados').in('id', ids);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  const { atualizarConversa } = await import('./ana.server');
  let avisos = 0;
  for (const r of rows.data) {
    const c = r.dados as unknown as Conversa;
    if (!aguardaRegistro(c, agora) || (c.avisosEquipe ?? []).some(a => a.id === `registro-consulta:${c.consultaAgendada}`)) continue;
    await atualizarConversa(db, r.id, x => avisarRegistroPendente(x, agora));
    avisos++;
  }
  return { avisos };
}

type Etapa = { nome: string; quando?: (agora: Date, anterior: EstadoMonitor | undefined) => string | undefined; executar: () => Promise<Record<string, unknown>>; limiteMs?: number };

/** Trava do ciclo (linha própria em `ana_monitoramento`): dois disparos simultâneos nunca executam juntos. */
export const ID_TRAVA_MONITOR = 'monitor-operacional-trava';
/** Trava vencida (ciclo interrompido no meio) pode ser retomada depois deste tempo. */
const TRAVA_MS = 2 * 60000;
/** Tempo máximo de uma etapa; a etapa lenta vira falha registrada e as demais continuam. */
const LIMITE_ETAPA_MS = 20000;
/** Abaixo disto de orçamento restante, a etapa fica para o próximo ciclo (com prioridade). */
const MINIMO_RESTANTE_MS = 5000;

async function adquirirTrava(db: Db, agora: Date, token: string): Promise<boolean> {
  const nova = await db.from('ana_monitoramento').insert({ id: ID_TRAVA_MONITOR, estado: { token } as unknown as Json, verificado_em: agora.toISOString() });
  if (!nova.error) return true;
  // Já existe: só toma a trava vencida (atualização condicional, atômica na linha).
  const vencida = await db.from('ana_monitoramento').update({ estado: { token } as unknown as Json, verificado_em: agora.toISOString() })
    .eq('id', ID_TRAVA_MONITOR).lt('verificado_em', new Date(agora.getTime() - TRAVA_MS).toISOString()).select('id');
  return !vencida.error && !!vencida.data?.length;
}

async function liberarTrava(db: Db, token: string) {
  await db.from('ana_monitoramento').update({ verificado_em: new Date(0).toISOString() }).eq('id', ID_TRAVA_MONITOR).eq('estado->>token', token);
}

function comLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`tempo limite de ${Math.round(ms / 1000)} s; continua no próximo ciclo`)), ms); });
  return Promise.race([p, limite]).finally(() => { if (timer) clearTimeout(timer); });
}

export type ResultadoMonitor = EstadoMonitor | { ignorado: string };

/**
 * Executa todas as automações dentro do orçamento de tempo e grava o estado. Justiça: etapas adiadas no ciclo anterior
 * rodam primeiro; cada etapa tem limite próprio; etapa adiada nunca é marcada como executada (mantém a data real).
 */
export async function executarMonitorOperacional(db: Db, request: Request, agora = new Date(), opcoes: { relogio?: () => number; portasAgenda?: PortasAgendaMonitor; etapas?: Etapa[]; token?: string } = {}): Promise<ResultadoMonitor> {
  const token = opcoes.token ?? `${agora.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  if (!(await adquirirTrava(db, agora, token))) return { ignorado: 'outra execução do monitor em andamento' };
  try {
    return await executarCiclo(db, request, agora, opcoes);
  } finally {
    await liberarTrava(db, token).catch(() => undefined);
  }
}

async function executarCiclo(db: Db, request: Request, agora: Date, opcoes: { relogio?: () => number; portasAgenda?: PortasAgendaMonitor; etapas?: Etapa[] }): Promise<EstadoMonitor> {
  const relogio = opcoes.relogio ?? (() => Date.now());
  const comeco = relogio();
  const anteriorRow = await db.from('ana_monitoramento').select('estado').eq('id', ID_MONITOR).maybeSingle();
  const anterior = (anteriorRow.data?.estado ?? undefined) as unknown as EstadoMonitor | undefined;
  const cfg = await db.from('atendimento_canal_config').select('canal_ativo').eq('id', true).maybeSingle();
  const whatsapp: EstadoMonitor['integracoes']['whatsapp'] = cfg.error ? 'desconhecido' : cfg.data?.canal_ativo === 'ultramsg' ? 'ativo' : 'desligado';
  const ultimaDe = (nome: string) => Date.parse(anterior?.etapas?.[nome]?.executadoEm ?? '') || 0;
  const aCada = (min: number) => (nome: string) => (agora.getTime() - ultimaDe(nome) < min * 60000 - 30000 ? `executada há menos de ${min} min` : undefined);
  const h = horaSP(agora);
  let pendenciasAgenda: EstadoMonitor['pendenciasAgenda'] = anterior?.pendenciasAgenda ?? [];
  let projuris: EstadoMonitor['integracoes']['projuris'] = 'nao_verificado';
  const etapas: Etapa[] = opcoes.etapas ?? [
    { nome: 'agenda-projuris', executar: async () => { const r = await sincronizarConsultasProjuris(db, agora, opcoes.portasAgenda); projuris = r.ok ? 'ok' : 'falha'; if (!r.ok) throw new Error(r.erro); pendenciasAgenda = r.pendencias; return { vinculadas: r.vinculadas, atualizadas: r.atualizadas, suspensas: r.suspensas, retomadas: r.retomadas, pendencias: r.pendencias.length }; }, limiteMs: 25000 },
    { nome: 'confirmacoes', executar: async () => (await import('./confirmacao-consulta.server')).enviarConfirmacoesConsulta(db, agora) },
    { nome: 'lembretes', quando: () => (h >= 8 && h < 12 ? undefined : 'lembrete do dia só entre 8h e 12h ("Bom dia")'), executar: async () => (await import('./lembrete-consulta.server')).enviarLembretesConsulta(db, agora) },
    { nome: 'registro-consultas', executar: () => avisarRegistrosPendentes(db, agora) },
    { nome: 'eventos-processuais', executar: async () => (await import('./eventos-processuais.server')).enviarLembretesEventos(db, agora) },
    { nome: 'andamentos-projuris', quando: () => aCada(30)('andamentos-projuris'), limiteMs: 25000, executar: async () => (await import('./eventos-processuais.server')).sincronizarAndamentosPrioritarios(db, agora) },
    { nome: 'pendencias-processo', quando: () => (whatsapp === 'ativo' ? undefined : 'WhatsApp desligado'), executar: async () => (await import('./consulta-processo.server')).executarPendenciasProcesso(db) as unknown as Promise<Record<string, unknown>> },
    { nome: 'recuperar-ana', executar: async () => (await import('./ana-recovery.server')).recuperarAna(db, request) },
    { nome: 'coleta', quando: (_a, _b) => aCada(30)('coleta'), executar: async () => (await import('./coleta.server')).enviarLembretesColeta(db) as unknown as Promise<Record<string, unknown>> },
    { nome: 'vendedor', quando: () => aCada(30)('vendedor'), executar: async () => (await import('./vendedor.server')).enviarFollowupsVendedor(db) as unknown as Promise<Record<string, unknown>> },
    { nome: 'reservas-pendentes', executar: async () => ({ lancadas: await (await import('./projuris-agenda.server')).sincronizarReservasPendentes(db) }) },
    { nome: 'relatorio-diario', quando: () => (h >= 8 && h < 10 ? undefined : 'relatório só entre 8h e 10h'), executar: async () => (await import('./relatorio-diario.server')).enviarRelatorioDiario(db) as unknown as Promise<Record<string, unknown>> },
  ];
  const resultados: Record<string, ResultadoEtapa> = {};
  // Justiça: as etapas adiadas por falta de tempo no ciclo anterior vão para a frente (ordem relativa preservada).
  const ordem = [...etapas.filter(e => anterior?.etapas?.[e.nome]?.adiada), ...etapas.filter(e => !anterior?.etapas?.[e.nome]?.adiada)];
  const adiadas: string[] = [];
  for (const e of ordem) {
    const inicio = relogio();
    const previa = anterior?.etapas?.[e.nome];
    const pular = e.quando?.(agora, anterior);
    if (pular) { resultados[e.nome] = { ...(previa ?? { ok: true, executadoEm: '', duracaoMs: 0 }), adiada: undefined, pulada: pular }; continue; }
    const restante = ORCAMENTO_MS - (inicio - comeco);
    if (restante < MINIMO_RESTANTE_MS) {
      // Adiada não é executada: mantém a data e o resultado reais da última execução.
      resultados[e.nome] = { ...(previa ?? { ok: true, executadoEm: '', duracaoMs: 0 }), pulada: 'tempo do ciclo esgotado; roda primeiro no próximo ciclo', adiada: true };
      adiadas.push(e.nome);
      continue;
    }
    try {
      const resumo = resumoSeguro(await comLimite(e.executar(), Math.min(e.limiteMs ?? LIMITE_ETAPA_MS, restante)));
      resultados[e.nome] = { ok: true, executadoEm: agora.toISOString(), duracaoMs: relogio() - inicio, resumo };
    } catch (error) {
      resultados[e.nome] = { ok: false, executadoEm: agora.toISOString(), duracaoMs: relogio() - inicio, erro: (error as Error)?.message?.slice(0, 200) ?? 'falha' };
    }
  }
  const falhas = Object.entries(resultados).filter(([, r]) => !r.ok && !r.pulada).map(([n]) => n);
  const estado: EstadoMonitor = {
    ultimaExecucao: agora.toISOString(),
    proximaPrevista: new Date(agora.getTime() + INTERVALO_MONITOR_MIN * 60000).toISOString(),
    duracaoMs: relogio() - comeco,
    ok: falhas.length === 0,
    etapas: resultados,
    adiadas,
    integracoes: { projuris, whatsapp },
    pendenciasAgenda,
    historico: [{ em: agora.toISOString(), ok: falhas.length === 0, duracaoMs: relogio() - comeco, falhas, ...(adiadas.length ? { adiadas } : {}) }, ...(anterior?.historico ?? [])].slice(0, HISTORICO),
  };
  const gravado = await db.from('ana_monitoramento').upsert({ id: ID_MONITOR, estado: estado as unknown as Json, verificado_em: agora.toISOString() });
  // Sem o registro gravado o painel mostraria um estado falso: a falha sobe para a rota (resposta 503 e log).
  if (gravado.error) throw new Error('Estado do monitor não foi gravado.');
  // Auditoria só na transição (etapa que passou a falhar ou voltou a funcionar), sem uma linha a cada 5 minutos.
  const antes = anterior?.historico?.[0]?.falhas ?? [];
  const novas = falhas.filter(f => !antes.includes(f)), recuperadas = antes.filter(f => !falhas.includes(f));
  if (novas.length) await db.rpc('registrar_audit_log', { p_ator: 'Anne', p_perfil: 'sistema', p_acao: 'monitorOperacional', p_resumo: `Etapas com falha: ${novas.join(', ')}`, p_status: 'erro' });
  if (recuperadas.length) await db.rpc('registrar_audit_log', { p_ator: 'Anne', p_perfil: 'sistema', p_acao: 'monitorOperacional', p_resumo: `Etapas normalizadas: ${recuperadas.join(', ')}`, p_status: 'sucesso' });
  return estado;
}
