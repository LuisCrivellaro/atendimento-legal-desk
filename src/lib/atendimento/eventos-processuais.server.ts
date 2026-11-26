import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { OfficeState } from '../office';
import { defaultAutomations, newMessage } from '../atendimento';
import { atualizarConversa } from './ana.server';
import { registrarAviso } from './avisos-equipe';
import { lerBiblioteca, renderizarOficial } from './biblioteca/renderizar';
import { nomeVerificado } from './biblioteca/selecao';
import { decidirLembretesEventos, marcarEnvioEvento, marcarPendenciaEvento, type ConfigEventos } from './eventos-processuais';
import { bloqueadoPorTeste, lerConfigSecretaria } from './secretaria/config';
import { decisaoRotina } from './secretaria/operacional';
import { contextoRotina, reservarEnvioRotina } from './secretaria/rotinas';
import { secretariaLigada } from './secretaria/secretaria.server';

type Db = SupabaseClient<Database>;

/** Dia útil: segunda a sexta, fora dos feriados nacionais (date-holidays, mesma regra da agenda). */
async function calendarioDiaUtil() {
  const { default: Holidays } = await import('date-holidays');
  const br = new Holidays('BR');
  return (diaIso: string) => {
    const d = new Date(`${diaIso}T12:00:00-03:00`);
    const semana = d.getUTCDay();
    if (semana === 0 || semana === 6) return false;
    return !(br.isHoliday(d) || []).some(h => h.type === 'public');
  };
}

/**
 * Lembretes e confirmações de audiência/perícia já comunicadas (T04, T11.2, T12.2, T12.3), no monitor central.
 * Só com modelo ativo na biblioteca (aprovação da Dra.), todos os campos vindos do texto aprovado ou do registro
 * oficial, permissão "acompanhamento_aprovado" no motor, contato liberado e dentro do horário; reserva antes do
 * envio e nunca reenvia. Modelo aguardando aprovação ou dado faltando: uma pendência por evento para a equipe.
 */
export async function enviarLembretesEventos(db: Db, agora = new Date()) {
  const res = { enviados: 0, pendencias: 0, falhas: 0, bloqueados: 0 };
  const cfgCanal = await db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id', true).single();
  if (cfgCanal.error) throw new Error('Configuração indisponível.');
  if (cfgCanal.data.canal_ativo !== 'ultramsg' || !cfgCanal.data.agente_ativo) return { ...res, motivo: 'canal ou Anne desligados' };
  const rows = await db.from('casos').select('id,owner_id,dados').not('dados->agenteAna->eventosProcessuais', 'is', null);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  if (!rows.data?.length) return res;
  const ids = rows.data.map(r => r.id);
  const donos = [...new Set(rows.data.map(r => r.owner_id))];
  const [contatos, ws] = await Promise.all([
    db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado').in('conversa_id', ids),
    db.from('office_workspace').select('owner_id,dados').in('owner_id', donos),
  ]);
  if (contatos.error || ws.error) throw new Error('Contatos ou automações indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  const estados = new Map((ws.data ?? []).map(w => [w.owner_id, w.dados as unknown as OfficeState]));
  const diaUtil = await calendarioDiaUtil();
  const { enviarMensagemSistema } = await import('./envio.functions');
  for (const row of rows.data) {
    const c = row.dados as unknown as Conversa;
    const state = estados.get(row.owner_id);
    const config = lerConfigSecretaria((state as { secretaria?: unknown } | undefined)?.secretaria);
    const contato = porConversa.get(row.id);
    const acoes = decidirLembretesEventos(c, agora, config.eventos as ConfigEventos, diaUtil, nomeVerificado(c));
    if (!acoes.length) continue;
    if (bloqueadoPorTeste(config, contato)) { res.bloqueados++; continue; }
    const biblioteca = lerBiblioteca((state as { bibliotecaMensagens?: unknown } | undefined)?.bibliotecaMensagens);
    const ctx = secretariaLigada(state) ? contextoRotina({ state, agenteAtivo: true, canalAtivo: true, contato, modoPadrao: state?.automations?.modoIA ?? defaultAutomations.modoIA, config }) : undefined;
    for (const a of acoes) {
      if ('pendencia' in a) {
        await atualizarConversa(db, row.id, x => registrarAviso(marcarPendenciaEvento(x, a.chave, a.id), { id: `evento:${a.id}:${a.chave}`, tipo: 'audiencia', prioridade: true, criadoEm: agora.toISOString(), texto: a.pendencia.slice(0, 300) }, false));
        res.pendencias++;
        continue;
      }
      const r = renderizarOficial(a.modelo, a.valores, { biblioteca });
      if (!r.ok) {
        // Modelo aguardando aprovação da Dra. ou campo sem dado verificado: a equipe recebe o texto oficial pronto.
        const id = r.motivo === 'inativo' ? `inativo-${a.modelo}` : `dados-${a.modelo}`;
        const pronto = renderizarOficial(a.modelo, a.valores, { biblioteca, exigirAtivo: false, deixarPendentes: true });
        const motivo = r.motivo === 'inativo' ? `modelo ${a.modelo} aguardando aprovação/ativação da Dra. na biblioteca` : `faltam dados verificados (${(r.faltando ?? []).join(', ')})`;
        let novo = false;
        await atualizarConversa(db, row.id, x => {
          const e = x.agenteAna?.eventosProcessuais?.find(y => y.chave === a.chave);
          novo = !e?.pendencias?.includes(id);
          return novo ? registrarAviso(marcarPendenciaEvento(x, a.chave, id), { id: `evento:${id}:${a.chave}`, tipo: 'audiencia', criadoEm: agora.toISOString(), texto: `Lembrete oficial ${a.modelo} não enviado: ${motivo}. Texto pronto para a equipe conferir.`.slice(0, 300), ...(pronto.ok ? { textoPronto: pronto.texto } : {}) }, false) : x;
        });
        if (novo) res.pendencias++;
        continue;
      }
      if (!contato) continue;
      const automacaoId = `evento:${a.modelo}:${a.chave}`.slice(0, 150);
      let reservado = false;
      await atualizarConversa(db, row.id, x => {
        reservado = false;
        const e = x.agenteAna?.eventosProcessuais?.find(y => y.chave === a.chave);
        if (!e || e.estado !== 'comunicado' || e.enviados?.[a.modelo]) return x;
        const permitido = ctx ? decisaoRotina(x, ctx, 'acompanhamento_aprovado', { agora, dadosVerificados: true }).resultado === 'executar' : !(x.agenteAna?.humano || x.agenteAna?.pausa || x.modoIA === 'Desligada');
        if (!permitido) return x;
        reservado = true;
        const marcada = marcarEnvioEvento(x, a.chave, a.modelo, agora);
        return ctx ? reservarEnvioRotina(marcada, automacaoId, r.texto, agora) : marcada;
      });
      if (!reservado) continue;
      try {
        const sent = await enviarMensagemSistema({ supabase: db, conversaId: row.id, texto: r.texto, motivo: `evento_${a.modelo}`, contatoEsperado: contato, ...(ctx ? { automacaoId } : {}) });
        if (sent.simulado) throw new Error('Canal desligado.');
        await atualizarConversa(db, row.id, x => ({
          ...x,
          mensagens: [...x.mensagens, newMessage(r.texto, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada', modeloOficial: { id: r.id, versao: r.versao }, ...(ctx ? { automacaoKey: automacaoId } : {}) })],
          agenteAna: { ...x.agenteAna, secretaria: x.agenteAna?.secretaria?.envio?.automacaoId === automacaoId ? { ...x.agenteAna.secretaria, envio: undefined } : x.agenteAna?.secretaria },
          timeline: [...x.timeline, { data: agora.toISOString(), evento: `Mensagem oficial ${a.modelo} enviada pela Anne (evento ${a.chave.split('|').slice(1, 3).join(' ')})` }],
        }));
        res.enviados++;
      } catch {
        res.falhas++;
        await atualizarConversa(db, row.id, x => registrarAviso(x, { id: `evento-falha:${a.modelo}:${a.chave}`, tipo: 'audiencia', prioridade: true, criadoEm: agora.toISOString(), texto: `Mensagem oficial ${a.modelo} sem recibo do WhatsApp: conferir a conversa; não reenviar sem conferir.` }, false)).catch(() => undefined);
      }
    }
  }
  return res;
}

/**
 * Sincronização automática e incremental de andamentos (reusa `sincronizarProcesso`: paginação completa, versões
 * append-only deduplicadas por hash, lease por processo, backoff em `retry_em`). Só processos de clientes com
 * vínculo confirmado, poucos por ciclo, priorizando os que têm audiência/perícia futura e os mais antigos sem
 * sincronização — nunca a base inteira a cada 5 minutos.
 */
export async function sincronizarAndamentosPrioritarios(db: Db, agora = new Date(), limite = 3) {
  const res = { sincronizados: 0, falhas: 0, candidatos: 0 };
  const bases = await db.from('projuris_base').select('owner_id,carteira').not('carteira', 'is', null);
  if (bases.error) throw new Error('Carteira do ProJuris indisponível.');
  const { processosDaBase } = await import('../projuris/base');
  const { processoDe } = await import('../projuris/mapeamento');
  const { sincronizarProcesso } = await import('../projuris/base.server');
  const fila: { owner: string; codigo: number; prioridade: number; ultimo: number }[] = [];
  for (const b of bases.data ?? []) {
    const casos = await db.from('casos').select('dados').eq('owner_id', b.owner_id).eq('dados->agenteAna->vinculoProjuris->>status', 'confirmado');
    if (casos.error) continue;
    const pessoas = new Map<number, Conversa>();
    for (const r of casos.data ?? []) { const c = r.dados as unknown as Conversa; const v = c.agenteAna?.vinculoProjuris; if (v?.status === 'confirmado') pessoas.set(v.codigoPessoa, c); }
    if (!pessoas.size) continue;
    const sync = await db.from('projuris_sync_processos').select('codigo_processo,ultimo_sucesso,retry_em,lease_ate').eq('owner_id', b.owner_id);
    const estado = new Map((sync.data ?? []).map(s => [s.codigo_processo, s]));
    for (const bruto of processosDaBase(b.carteira as never)) {
      const p = processoDe(bruto);
      if (!p) continue;
      const cliente = p.envolvidos.find(x => x.cliente && pessoas.has(x.codigoPessoa));
      if (!cliente) continue;
      const s = estado.get(p.codigo);
      if (s?.retry_em && Date.parse(s.retry_em) > agora.getTime()) continue;
      if (s?.lease_ate && Date.parse(s.lease_ate) > agora.getTime()) continue;
      const conversa = pessoas.get(cliente.codigoPessoa);
      const eventoFuturo = (conversa?.agenteAna?.eventosProcessuais ?? []).some(e => e.codigoProcesso === p.codigo && (e.estado === 'comunicado' || e.estado === 'rascunho'));
      const ultimo = Date.parse(s?.ultimo_sucesso ?? '') || 0;
      // Já sincronizado nas últimas 6 h (ou 1 h com evento): não precisa agora.
      if (agora.getTime() - ultimo < (eventoFuturo ? 1 : 6) * 3600000) continue;
      fila.push({ owner: b.owner_id, codigo: p.codigo, prioridade: eventoFuturo ? 0 : 1, ultimo });
    }
  }
  fila.sort((a, b) => a.prioridade - b.prioridade || a.ultimo - b.ultimo);
  res.candidatos = fila.length;
  for (const item of fila.slice(0, limite)) {
    try {
      const r = await sincronizarProcesso(db, item.owner, item.codigo);
      if (r.ok) res.sincronizados++; else res.falhas++;
    } catch { res.falhas++; }
  }
  return res;
}
