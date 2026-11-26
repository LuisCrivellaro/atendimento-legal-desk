import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { CompromissoPJ } from '../projuris/agenda';
import { registrarAviso } from './avisos-equipe';
import { aplicarNovoHorario, aplicarVinculo, planejarSincronizacao, type ConversaAgenda } from './sincronizacao-agenda';
import { avisarRegistroPendente, aguardaRegistro, registrarCancelamentoOficial } from './situacao-consulta';
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
 * Cancelamento só com o compromisso conferido pelo código como concluído ou inexistente.
 */
export async function sincronizarConsultasProjuris(db: Db, agora = new Date(), portas: PortasAgendaMonitor = {}) {
  const contatos = await db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado');
  if (contatos.error) throw new Error('Contatos indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  if (!porConversa.size) return { ok: true, vinculadas: 0, atualizadas: 0, canceladas: 0, pendencias: [] as EstadoMonitor['pendenciasAgenda'] };
  const rows = await db.from('casos').select('id,owner_id,dados').in('id', [...porConversa.keys()]);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  const conversas: ConversaAgenda[] = rows.data.map(r => ({ id: r.id, conversa: r.dados as unknown as Conversa, contato: porConversa.get(r.id) }));
  const listar = portas.listar ?? (async (i: number, f: number) => (await import('../projuris/agenda.server')).listarCompromissos(i, f));
  const situacao = portas.situacao ?? (async (codigo: number) => (await import('../projuris/agenda.server')).situacaoCompromisso(codigo));
  let compromissos: CompromissoPJ[];
  try { compromissos = await listar(agora.getTime() - 2 * 3600000, agora.getTime() + 15 * 86400000); }
  catch { return { ok: false, erro: 'Agenda do ProJuris indisponível; nada foi alterado.', vinculadas: 0, atualizadas: 0, canceladas: 0, pendencias: [] as EstadoMonitor['pendenciasAgenda'] }; }
  const { atualizarConversa } = await import('./ana.server');
  const resultado = { ok: true, vinculadas: 0, atualizadas: 0, canceladas: 0, pendencias: [] as EstadoMonitor['pendenciasAgenda'] };
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
      const s = await situacao(acao.codigo);
      if (s !== 'concluido' && s !== 'ausente') continue;
      let cancelada = false;
      await atualizarConversa(db, acao.conversaId, x => {
        cancelada = false;
        if (x.agenteAna?.reservaCalendar?.id !== `pj:${acao.codigo}` || !x.consultaAgendada) return x;
        cancelada = true;
        const inicio = x.consultaAgendada;
        return registrarAviso(registrarCancelamentoOficial(x, s === 'concluido' ? 'compromisso concluído no ProJuris' : 'compromisso não existe mais no ProJuris', agora), { id: `agenda-cancelada:${inicio}`, tipo: 'projuris', criadoEm: agora.toISOString(), texto: `A consulta de ${dataOficial(inicio)} às ${horarioOficial(inicio)} foi concluída ou removida no ProJuris: lembrete e confirmação suspensos.` }, false);
      });
      if (cancelada) resultado.canceladas++;
    } else {
      const quando = new Date(acao.compromisso.inicioMs).toISOString();
      resultado.pendencias.push({ quando, titulo: acao.compromisso.titulo.slice(0, 80), motivo: acao.motivo });
      if (acao.conversaId) await atualizarConversa(db, acao.conversaId, x => registrarAviso(x, { id: `agenda-pendencia:${acao.compromisso.codigo}`, tipo: 'projuris', criadoEm: agora.toISOString(), texto: `Compromisso no ProJuris em ${dataOficial(quando)} às ${horarioOficial(quando)} parece deste cliente, mas ${acao.motivo}: conferir antes de qualquer automação.` }, false));
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

type Etapa = { nome: string; quando?: (agora: Date, anterior: EstadoMonitor | undefined) => string | undefined; executar: () => Promise<Record<string, unknown>> };

/** Executa todas as automações em ordem de prioridade, dentro do orçamento de tempo, e grava o estado. */
export async function executarMonitorOperacional(db: Db, request: Request, agora = new Date(), opcoes: { relogio?: () => number; portasAgenda?: PortasAgendaMonitor; etapas?: Etapa[] } = {}): Promise<EstadoMonitor> {
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
    { nome: 'agenda-projuris', executar: async () => { const r = await sincronizarConsultasProjuris(db, agora, opcoes.portasAgenda); projuris = r.ok ? 'ok' : 'falha'; if (!r.ok) throw new Error(r.erro); pendenciasAgenda = r.pendencias; return { vinculadas: r.vinculadas, atualizadas: r.atualizadas, canceladas: r.canceladas, pendencias: r.pendencias.length }; } },
    { nome: 'confirmacoes', executar: async () => (await import('./confirmacao-consulta.server')).enviarConfirmacoesConsulta(db, agora) },
    { nome: 'lembretes', quando: () => (h >= 8 && h < 12 ? undefined : 'lembrete do dia só entre 8h e 12h ("Bom dia")'), executar: async () => (await import('./lembrete-consulta.server')).enviarLembretesConsulta(db, agora) },
    { nome: 'registro-consultas', executar: () => avisarRegistrosPendentes(db, agora) },
    { nome: 'pendencias-processo', quando: () => (whatsapp === 'ativo' ? undefined : 'WhatsApp desligado'), executar: async () => (await import('./consulta-processo.server')).executarPendenciasProcesso(db) as unknown as Promise<Record<string, unknown>> },
    { nome: 'recuperar-ana', executar: async () => (await import('./ana-recovery.server')).recuperarAna(db, request) },
    { nome: 'coleta', quando: (_a, _b) => aCada(30)('coleta'), executar: async () => (await import('./coleta.server')).enviarLembretesColeta(db) as unknown as Promise<Record<string, unknown>> },
    { nome: 'vendedor', quando: () => aCada(30)('vendedor'), executar: async () => (await import('./vendedor.server')).enviarFollowupsVendedor(db) as unknown as Promise<Record<string, unknown>> },
    { nome: 'reservas-pendentes', executar: async () => ({ lancadas: await (await import('./projuris-agenda.server')).sincronizarReservasPendentes(db) }) },
    { nome: 'relatorio-diario', quando: () => (h >= 8 && h < 10 ? undefined : 'relatório só entre 8h e 10h'), executar: async () => (await import('./relatorio-diario.server')).enviarRelatorioDiario(db) as unknown as Promise<Record<string, unknown>> },
  ];
  const resultados: Record<string, ResultadoEtapa> = {};
  for (const e of etapas) {
    const inicio = relogio();
    const pular = e.quando?.(agora, anterior);
    if (pular) { resultados[e.nome] = { ...(anterior?.etapas?.[e.nome] ?? { ok: true, executadoEm: '', duracaoMs: 0 }), pulada: pular }; continue; }
    if (inicio - comeco > ORCAMENTO_MS) { resultados[e.nome] = { ok: false, executadoEm: agora.toISOString(), duracaoMs: 0, pulada: 'tempo do ciclo esgotado; fica para o próximo' }; continue; }
    try {
      const resumo = resumoSeguro(await e.executar());
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
    integracoes: { projuris, whatsapp },
    pendenciasAgenda,
    historico: [{ em: agora.toISOString(), ok: falhas.length === 0, duracaoMs: relogio() - comeco, falhas }, ...(anterior?.historico ?? [])].slice(0, HISTORICO),
  };
  await db.from('ana_monitoramento').upsert({ id: ID_MONITOR, estado: estado as unknown as Json, verificado_em: agora.toISOString() });
  // Auditoria só na transição (etapa que passou a falhar ou voltou a funcionar), sem uma linha a cada 5 minutos.
  const antes = anterior?.historico?.[0]?.falhas ?? [];
  const novas = falhas.filter(f => !antes.includes(f)), recuperadas = antes.filter(f => !falhas.includes(f));
  if (novas.length) await db.rpc('registrar_audit_log', { p_ator: 'Anne', p_perfil: 'sistema', p_acao: 'monitorOperacional', p_resumo: `Etapas com falha: ${novas.join(', ')}`, p_status: 'erro' });
  if (recuperadas.length) await db.rpc('registrar_audit_log', { p_ator: 'Anne', p_perfil: 'sistema', p_acao: 'monitorOperacional', p_resumo: `Etapas normalizadas: ${recuperadas.join(', ')}`, p_status: 'sucesso' });
  return estado;
}
