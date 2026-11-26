import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '@/lib/mock-data';
import { podeExecutarAna } from '@/lib/atendimento/ana-execution';
import { limiteDiarioIA } from '@/lib/atendimento/ia-orcamento.server';
import { avaliarSaude, alertasNovos, type SaudeAna } from './saude';
import { conferirWebhookWhatsApp, eventoLigado, urlPublicaApp } from '@/lib/atendimento/url-publica';

type Db = SupabaseClient<Database>;
const env = (n: string) => process.env[n]?.trim() ?? '';

/**
 * Sonda de ponta a ponta, sem segredo: a rota viva responde 401; domínio inexistente responde 404 (página do Lovable).
 * Nada é processado, pois a rota recusa antes de ler o corpo.
 */
async function rotaAlcancavel(registrada: string): Promise<{ alcancavel: boolean; http?: number }> {
  try {
    const u = new URL(registrada);
    const r = await fetch(`${u.origin}${u.pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000) });
    return { alcancavel: r.status === 401, http: r.status };
  } catch { return { alcancavel: false }; }
}

async function whatsapp() {
  const inst = env('ULTRAMSG_INSTANCE_ID'), token = env('ULTRAMSG_TOKEN');
  if (!inst || !token) return { w: { configurado: false }, wh: { correto: false, erro: 'Credenciais ausentes' } };
  const base = `https://api.ultramsg.com/${encodeURIComponent(inst)}/instance`;
  const [st, se] = await Promise.allSettled([
    fetch(`${base}/status?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    fetch(`${base}/settings?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
  ]);
  const status = st.status === 'fulfilled' ? (st.value as { status?: { accountStatus?: { status?: string } } })?.status?.accountStatus?.status : undefined;
  if (se.status !== 'fulfilled') return { w: { configurado: true, ...(status ? { status } : { erro: 'UltraMsg não respondeu' }) }, wh: { erro: 'Configuração do webhook ilegível' } };
  const cfg = (se.value ?? {}) as { webhook_url?: string; webhook_message_received?: unknown; webhook_message_create?: unknown };
  const url = String(cfg.webhook_url ?? '');
  const conf = conferirWebhookWhatsApp(url, urlPublicaApp(env('PUBLIC_APP_URL')), env('ULTRAMSG_WEBHOOK_SECRET'));
  const sonda = conf.host ? await rotaAlcancavel(url) : { alcancavel: false };
  const recebidas = eventoLigado(cfg.webhook_message_received), criadas = eventoLigado(cfg.webhook_message_create);
  const erro = !conf.correto ? conf.motivo
    : !sonda.alcancavel ? `Endereço de recebimento não respondeu como esperado${sonda.http ? ` (HTTP ${sonda.http})` : ''}`
    : !recebidas ? 'Evento "mensagem recebida" desligado no UltraMsg'
    : undefined;
  return {
    w: { configurado: true, ...(status ? { status } : { erro: 'UltraMsg não respondeu' }) },
    wh: { correto: conf.correto && sonda.alcancavel && recebidas, host: conf.host, alcancavel: sonda.alcancavel, eventos: { recebidas, criadas }, ...(erro ? { erro } : {}) },
  };
}

async function chaveClaude() {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return { chaveOk: false, erro: 'ANTHROPIC_API_KEY ausente' };
  // Listagem de modelos não consome tokens.
  try { const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(8000) });
    return r.ok ? { chaveOk: true } : { chaveOk: false, erro: `Claude respondeu ${r.status}` };
  } catch { return { chaveOk: false, erro: 'Claude inacessível' }; }
}

export async function coletarSaude(db: Db, agora = Date.now()): Promise<SaudeAna> {
  const desde = new Date(agora - 86400000).toISOString();
  const dia = new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
  const [ping, wa, ia, consumo, okExec, erros, agenda, contatos, pj, pjFalhas] = await Promise.all([
    db.from('atendimento_canal_config').select('agente_ativo').limit(1),
    whatsapp(), chaveClaude(),
    db.from('ana_consumo_ia').select('chamadas,bloqueadas').eq('dia', dia).maybeSingle(),
    db.from('audit_log').select('criado_em').eq('ator', 'Ana').eq('status', 'sucesso').order('criado_em', { ascending: false }).limit(1).maybeSingle(),
    db.from('audit_log').select('id', { count: 'exact', head: true }).eq('status', 'erro').gte('criado_em', desde),
    db.from('audit_log').select('id', { count: 'exact', head: true }).eq('status', 'erro').in('acao', ['reservaCalendar', 'cancelarCalendar']).gte('criado_em', desde),
    db.from('atendimento_contatos_teste').select('conversa_id').eq('canal', 'ultramsg').eq('status', 'liberado'),
    db.from('projuris_base').select('sincronizado_em').order('sincronizado_em', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    db.from('projuris_sync_processos').select('codigo_processo', { count: 'exact', head: true }).gt('falhas', 0),
  ]);
  let pendentes = 0, incertas = 0, ultimaRecebida: string | null = null, ultimaEnviada: string | null = null;
  const ids = [...new Set((contatos.data ?? []).map(c => c.conversa_id).filter((x): x is string => !!x))];
  if (ids.length) {
    const rows = await db.from('casos').select('dados').in('id', ids);
    for (const r of rows.data ?? []) {
      const c = r.dados as unknown as Conversa;
      for (const m of c.mensagens ?? []) {
        if (m.canal !== 'ultramsg' || !m.dataHora) continue;
        if (m.de === 'cliente' && (!ultimaRecebida || m.dataHora > ultimaRecebida)) ultimaRecebida = m.dataHora;
        if (m.de === 'escritorio' && m.status !== 'simulada' && (!ultimaEnviada || m.dataHora > ultimaEnviada)) ultimaEnviada = m.dataHora;
      }
      const u = c.mensagens?.at(-1);
      if (u?.de === 'cliente' && u.canal === 'ultramsg' && !c.agenteAna?.humano && !c.agenteAna?.pausa) {
        if (u.iaExecucao?.estado === 'incerta' || (u.iaExecucao?.estado === 'enviando' && agora - Date.parse(u.iaExecucao.desde) > 300000)) incertas++;
        else if (u.iaExecucao ? podeExecutarAna(u, agora) || u.iaExecucao.estado === 'aguardando' : !u.iaProcessada) pendentes++;
      }
    }
  }
  return avaliarSaude({
    agora, backendOk: !ping.error, whatsapp: wa.w, webhook: wa.wh,
    ia: { ...ia, chamadasHoje: consumo.data?.chamadas ?? 0, bloqueadasHoje: consumo.data?.bloqueadas ?? 0, limite: limiteDiarioIA() },
    ultimaExecucaoOk: okExec.data?.criado_em ?? null, ultimaRecebida, ultimaEnviada,
    errosUltimas24h: erros.count ?? 0, pendentes, incertas, agendaErros24h: agenda.count ?? 0,
    projuris: { sincronizadoEm: pj.data?.sincronizado_em ?? null, falhasProcessos: pjFalhas.count ?? 0 },
  });
}

/** Verificação persistente: grava o estado, registra alertas novos e recuperação. */
export async function verificarESalvar(db: Db) {
  const saude = await coletarSaude(db);
  const ant = await db.from('ana_monitoramento').select('estado').eq('id', 'global').maybeSingle();
  const anterior = ant.data?.estado as unknown as SaudeAna | undefined;
  for (const a of alertasNovos(anterior?.alertas, saude.alertas))
    await db.rpc('registrar_audit_log', { p_ator: 'Monitor', p_perfil: 'sistema', p_acao: 'alertaAna', p_resumo: a.slice(0, 300), p_status: 'erro', p_erro: a.slice(0, 400) });
  if (anterior?.alertas?.length && !saude.alertas.length)
    await db.rpc('registrar_audit_log', { p_ator: 'Monitor', p_perfil: 'sistema', p_acao: 'alertaAna', p_resumo: 'Ana e integrações normalizadas', p_status: 'sucesso' });
  const w = await db.from('ana_monitoramento').upsert({ id: 'global', estado: saude as never, verificado_em: saude.verificadoEm });
  if (w.error) throw new Error('Falha ao gravar monitoramento.');
  return saude;
}
