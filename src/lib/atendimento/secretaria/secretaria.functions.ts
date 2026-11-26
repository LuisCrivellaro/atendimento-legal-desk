import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../../mock-data';
import { lerConfigSecretaria } from './config';
import { esquemaConfigSecretaria } from './config-schema';

/**
 * Funções autenticadas da secretaria digital para o Atendimento e a configuração.
 * - Modo e automações: só o dono da conversa (mesma regra de `controlarAnaConversa`), com a flag ligada.
 * - Configuração (flag, permissões, janelas, modelos): só sênior/admin, gravada pelo servidor com CAS.
 * O modelo nunca chama estas funções e não há caminho para a IA alterar as próprias permissões.
 */

const MODOS = ['automatico', 'hibrido', 'humano', 'bloqueado'] as const;

type Db = SupabaseClient<Database>;

async function nomeDoUsuario(supabase: Db, userId: string) {
  const r = await supabase.from('profiles').select('nome').eq('id', userId).maybeSingle();
  return String(r.data?.nome ?? 'equipe').slice(0, 80);
}

async function exigirDono(context: { supabase: Db; userId: string }, conversaId: string) {
  const row = await context.supabase.from('casos').select('owner_id,dados').eq('id', conversaId).single();
  if (row.error || row.data.owner_id !== context.userId) throw new Error('Conversa indisponível para esta conta.');
  const ws = await context.supabase.from('office_workspace').select('dados').eq('owner_id', context.userId).maybeSingle();
  if (ws.error) throw new Error('Configuração indisponível.');
  const { secretariaLigada } = await import('./secretaria.server');
  if (!secretariaLigada(ws.data?.dados)) throw new Error('Secretaria digital desligada. Ligue em Automações do Atendimento (sênior/admin).');
  return { conversa: row.data.dados as unknown as Conversa, state: ws.data?.dados as Record<string, unknown> | undefined };
}

async function auditar(supabase: Db, ator: string, acao: string, resumo: string, status: 'sucesso' | 'erro' | 'bloqueado' = 'sucesso') {
  const r = await supabase.rpc('registrar_audit_log', { p_ator: ator, p_perfil: 'equipe', p_acao: acao, p_resumo: resumo.slice(0, 300), p_status: status });
  if (r.error) throw new Error('Alteração salva; auditoria pendente. Atualize a conversa.');
}

/** Define o modo da Anne na conversa. Voltar ao Automático a partir de Humano/Bloqueado exige confirmação explícita. */
export const definirModoAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), modo: z.enum(MODOS), confirmarAutomatico: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const { conversa, state } = await exigirDono(context, data.conversaId);
    const { modoEfetivo, aplicarModo } = await import('./modos');
    const { defaultAutomations } = await import('../../atendimento');
    const modoPadrao = ((state?.['automations'] as { modoIA?: string } | undefined)?.modoIA ?? defaultAutomations.modoIA) as typeof defaultAutomations.modoIA;
    const atual = modoEfetivo(conversa, modoPadrao).modo;
    if (data.modo === 'automatico' && (atual === 'humano' || atual === 'bloqueado') && !data.confirmarAutomatico) throw new Error('Confirme a volta ao modo Automático: a Anne voltará a conduzir esta conversa.');
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const { atualizarConversa } = await import('../ana.server');
    await atualizarConversa(context.supabase, data.conversaId, c => aplicarModo(c, data.modo, { tipo: 'equipe', autor }));
    await auditar(context.supabase, autor, 'modoAnne', `Modo da Anne: ${data.modo} (antes: ${atual})`);
    return { ok: true as const, modo: data.modo };
  });

/** Pausa, retoma ou cancela uma automação da conversa (estado final nunca reabre). */
export const controlarAutomacaoAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), automacaoId: z.string().min(1).max(160), controle: z.enum(['pausar', 'retomar', 'cancelar']) }))
  .handler(async ({ data, context }) => {
    await exigirDono(context, data.conversaId);
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const { controlarAutomacao } = await import('./automacoes');
    const { registrarAcao } = await import('./estado');
    const { atualizarConversa } = await import('../ana.server');
    let ok = false;
    await atualizarConversa(context.supabase, data.conversaId, c => {
      const r = controlarAutomacao(c.agenteAna?.secretaria?.automacoes, data.automacaoId, data.controle, autor);
      ok = r.ok;
      if (!r.ok) return c;
      const agora = new Date().toISOString();
      return { ...c, agenteAna: { ...c.agenteAna, secretaria: { ...c.agenteAna?.secretaria, automacoes: r.lista, acoes: registrarAcao(c.agenteAna?.secretaria?.acoes, { id: `controle:${data.automacaoId}:${agora}`, em: agora, funcionalidade: 'mensagem_programada', resultado: 'executada', motivo: 'permitido', texto: `Automação ${data.controle === 'pausar' ? 'pausada' : data.controle === 'retomar' ? 'retomada' : 'cancelada'} por ${autor}.`, automacaoId: data.automacaoId }) } } };
    });
    if (!ok) throw new Error('Automação já encerrada ou alterada; atualize a conversa.');
    await auditar(context.supabase, autor, 'automacaoAnne', `${data.controle} · ${data.automacaoId.split(':')[0]}`);
    return { ok: true as const };
  });

/** A equipe delega à Anne o reagendamento da consulta (modo Híbrido): opções verificadas, confirmação e recibo. */
export const delegarReagendamentoAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await exigirDono(context, data.conversaId);
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const { contextoSecretaria, portasSupabase } = await import('./secretaria.server');
    const { iniciarReagendamentoDelegado } = await import('./operacional');
    const ctx = await contextoSecretaria(context.supabase, data.conversaId);
    const r = await iniciarReagendamentoDelegado(portasSupabase(context.supabase, ctx.ownerId, data.conversaId), ctx, data.conversaId, autor);
    await auditar(context.supabase, autor, 'reagendamentoAnne', r.ok ? 'Reagendamento delegado: opções verificadas enviadas' : `Reagendamento não iniciado: ${r.motivo}`, r.ok ? 'sucesso' : 'bloqueado');
    if (!r.ok) throw new Error(r.motivo);
    return { ok: true as const, motivo: r.motivo };
  });

/**
 * Registro da equipe: consulta realizada ou cliente faltou (nunca presumido pelo horário). A falta inicia o
 * reagendamento automático (modelo oficial 06 quando há dois horários hoje), se permitido e fora de Humano/Bloqueado.
 */
export const registrarSituacaoConsultaAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), estado: z.enum(['realizada', 'ausente']) }))
  .handler(async ({ data, context }) => {
    const row = await context.supabase.from('casos').select('owner_id').eq('id', data.conversaId).single();
    if (row.error || row.data.owner_id !== context.userId) throw new Error('Conversa indisponível para esta conta.');
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const { registrarSituacao } = await import('../situacao-consulta');
    const { atualizarConversa } = await import('../ana.server');
    let erro: string | undefined;
    await atualizarConversa(context.supabase, data.conversaId, c => {
      const r = registrarSituacao(c, data.estado, autor);
      erro = r.ok ? undefined : r.erro;
      return r.ok ? r.conversa : c;
    });
    if (erro) throw new Error(erro === 'ainda_nao_comecou' ? 'A consulta ainda não começou.' : erro === 'ja_registrada' ? 'Esta consulta já foi registrada.' : 'Não há consulta marcada nesta conversa.');
    await auditar(context.supabase, autor, 'situacaoConsulta', `Consulta registrada como ${data.estado}`);
    if (data.estado !== 'ausente') return { ok: true as const, reagendamento: undefined };
    const { contextoSecretaria, portasSupabase } = await import('./secretaria.server');
    const { iniciarReagendamentoAutomatico } = await import('./operacional');
    const ctx = await contextoSecretaria(context.supabase, data.conversaId);
    const r = await iniciarReagendamentoAutomatico(portasSupabase(context.supabase, ctx.ownerId, data.conversaId), ctx, data.conversaId, 'ausencia', autor);
    return { ok: true as const, reagendamento: r };
  });

/** Estado do monitor operacional e mensagens programadas desta conta (próximas 36 h). */
export const lerMonitorOperacionalAnne = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { ID_MONITOR } = await import('../monitor-estado');
    const [monitor, ws, casos] = await Promise.all([
      supabaseAdmin.from('ana_monitoramento').select('estado,verificado_em').eq('id', ID_MONITOR).maybeSingle(),
      context.supabase.from('office_workspace').select('dados').eq('owner_id', context.userId).maybeSingle(),
      context.supabase.from('casos').select('id,nome,dados').eq('owner_id', context.userId),
    ]);
    const { programadasDaConta } = await import('../monitor-programadas');
    const config = lerConfigSecretaria((ws.data?.dados as { secretaria?: unknown } | null)?.secretaria);
    const lista = ((casos.data ?? []) as unknown as { id: string; nome: string; dados: Conversa }[]);
    const gestor = await ehGestor(context.supabase, context.userId);
    const estado = (monitor.data?.estado ?? null) as unknown as import('../monitor-estado').EstadoMonitor | null;
    return {
      estado: estado ? { ...estado, pendenciasAgenda: gestor ? estado.pendenciasAgenda : estado.pendenciasAgenda.map(p => ({ ...p, titulo: '' })) } : null,
      ...programadasDaConta(lista, config, new Date()),
      testeAutomacoes: config.testeAutomacoes,
      antecedenciaMin: config.confirmacaoAntecedenciaMin,
    };
  });

/** Leitura leve para o alerta de rotina parada no Atendimento (só horário da última execução e se houve falha). */
export const lerSaudeMonitorAnne = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { ID_MONITOR } = await import('../monitor-estado');
    const r = await supabaseAdmin.from('ana_monitoramento').select('estado').eq('id', ID_MONITOR).maybeSingle();
    const e = r.data?.estado as { ultimaExecucao?: string; ok?: boolean } | null | undefined;
    return { ultimaExecucao: e?.ultimaExecucao ?? null, ok: e?.ok ?? null };
  });

async function ehGestor(supabase: Db, userId: string) {
  const [senior, admin] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'advogada_senior' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  return !!senior.data || !!admin.data;
}

/** Configuração da secretaria da própria área de trabalho; `podeEditar` só para sênior/admin. */
export const lerConfigSecretariaAnne = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ws = await context.supabase.from('office_workspace').select('dados').eq('owner_id', context.userId).maybeSingle();
    if (ws.error) throw new Error('Configuração indisponível.');
    const config = lerConfigSecretaria((ws.data?.dados as { secretaria?: unknown } | null)?.secretaria);
    return { config, podeEditar: await ehGestor(context.supabase, context.userId), chaveMestraDesligada: ['1', 'true'].includes(process.env['ANNE_SECRETARIA_DESLIGADA'] ?? '') };
  });

export const salvarConfigSecretariaAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(esquemaConfigSecretaria)
  .handler(async ({ data, context }) => {
    if (!(await ehGestor(context.supabase, context.userId))) throw new Error('Seu perfil não permite alterar as permissões da Anne.');
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    // Normaliza com as mesmas regras da leitura (ex.: andamento processual nunca automático).
    const config = lerConfigSecretaria({ ...data, atualizadoEm: new Date().toISOString(), atualizadoPor: autor });
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const row = await context.supabase.from('office_workspace').select('dados,updated_at').eq('owner_id', context.userId).maybeSingle();
      if (row.error) throw new Error('Não foi possível salvar a configuração.');
      const dados = { ...((row.data?.dados as Record<string, unknown> | null) ?? {}), secretaria: config };
      const r = row.data
        ? await context.supabase.from('office_workspace').update({ dados: dados as unknown as Json, updated_at: new Date().toISOString() }).eq('owner_id', context.userId).eq('updated_at', row.data.updated_at).select('owner_id')
        : await context.supabase.from('office_workspace').insert({ owner_id: context.userId, dados: dados as unknown as Json }).select('owner_id');
      if (r.error) throw new Error('Não foi possível salvar a configuração.');
      if (r.data?.length) {
        await auditar(context.supabase, autor, 'configSecretariaAnne', `Secretaria ${config.ativa ? 'ligada' : 'desligada'} · janela humana ${config.janelaPrioridadeHumanaMin} min`);
        return config;
      }
    }
    throw new Error('Área de trabalho alterada ao mesmo tempo. Tente de novo.');
  });
