import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database, Json } from '@/integrations/supabase/types';
import { IDS_TEMPLATES, TEMPLATES_OFICIAIS, variaveisPermitidas, type IdTemplate } from './mensagens-oficiais';
import { lerBiblioteca, templateVigente, versaoValida, type BibliotecaSalva } from './renderizar';

/**
 * Biblioteca oficial na tela: leitura para a equipe; nova versão, ativação e escolha da consulta paga só por
 * sênior/admin, gravadas pelo servidor (CAS) com autor, data e motivo. O modelo de IA não tem acesso a nada disto.
 */

type Db = SupabaseClient<Database>;

async function ehGestor(supabase: Db, userId: string) {
  const [senior, admin] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'advogada_senior' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  return !!senior.data || !!admin.data;
}

async function nomeDoUsuario(supabase: Db, userId: string) {
  const r = await supabase.from('profiles').select('nome').eq('id', userId).maybeSingle();
  return String(r.data?.nome ?? 'equipe').slice(0, 80);
}

/** Grava a biblioteca na área de trabalho do próprio gestor, com CAS e auditoria. */
async function gravar(supabase: Db, userId: string, autor: string, alterar: (b: BibliotecaSalva) => BibliotecaSalva, resumo: string) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const row = await supabase.from('office_workspace').select('dados,updated_at').eq('owner_id', userId).maybeSingle();
    if (row.error) throw new Error('Não foi possível salvar a biblioteca.');
    const dados = (row.data?.dados as Record<string, unknown> | null) ?? {};
    const atual = lerBiblioteca(dados['bibliotecaMensagens']);
    const proxima = { ...alterar(atual), atualizadoEm: new Date().toISOString(), atualizadoPor: autor };
    const novo = { ...dados, bibliotecaMensagens: proxima };
    const r = row.data
      ? await supabase.from('office_workspace').update({ dados: novo as unknown as Json, updated_at: new Date().toISOString() }).eq('owner_id', userId).eq('updated_at', row.data.updated_at).select('owner_id')
      : await supabase.from('office_workspace').insert({ owner_id: userId, dados: novo as unknown as Json }).select('owner_id');
    if (r.error) throw new Error('Não foi possível salvar a biblioteca.');
    if (r.data?.length) {
      const audit = await supabase.rpc('registrar_audit_log', { p_ator: autor, p_perfil: 'equipe', p_acao: 'bibliotecaMensagens', p_resumo: resumo.slice(0, 300), p_status: 'sucesso' });
      if (audit.error) throw new Error('Biblioteca salva; auditoria pendente.');
      return lerBiblioteca(proxima);
    }
  }
  throw new Error('Área de trabalho alterada ao mesmo tempo. Tente de novo.');
}

/** Modelos com texto vigente, estado, histórico de versões e uso (mensagens enviadas com cada modelo). */
export const lerBibliotecaMensagens = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [ws, casos] = await Promise.all([
      context.supabase.from('office_workspace').select('dados').eq('owner_id', context.userId).maybeSingle(),
      context.supabase.from('casos').select('mensagens:dados->mensagens').eq('owner_id', context.userId),
    ]);
    if (ws.error) throw new Error('Biblioteca indisponível.');
    const biblioteca = lerBiblioteca((ws.data?.dados as { bibliotecaMensagens?: unknown } | null)?.bibliotecaMensagens);
    const uso: Record<string, { total: number; ultimo?: string }> = {};
    for (const row of ((casos.data ?? []) as unknown as { mensagens: { modeloOficial?: { id?: string }; dataHora?: string }[] | null }[])) {
      for (const m of row.mensagens ?? []) {
        const id = m.modeloOficial?.id;
        if (!id) continue;
        const u = uso[id] ?? { total: 0 };
        u.total++;
        if (m.dataHora && (!u.ultimo || m.dataHora > u.ultimo)) u.ultimo = m.dataHora;
        uso[id] = u;
      }
    }
    const modelos = IDS_TEMPLATES.map(id => {
      const t = TEMPLATES_OFICIAIS[id];
      const vigente = templateVigente(id, biblioteca);
      return {
        id, titulo: t.titulo, gatilho: t.gatilho, condicoes: t.condicoes, fontes: t.fontes, aprovacao: t.aprovacao, integracao: t.integracao,
        variaveis: variaveisPermitidas(id), textoOficialV1: t.texto, texto: vigente.texto, versao: vigente.versao, ativacao: vigente.ativacao,
        historico: biblioteca.versoes?.[id] ?? [], uso: uso[id] ?? { total: 0 },
      };
    });
    return { modelos, consultaPaga: biblioteca.consultaPaga ?? null, podeEditar: await ehGestor(context.supabase, context.userId), atualizadoEm: biblioteca.atualizadoEm ?? null, atualizadoPor: biblioteca.atualizadoPor ?? null };
  });

const ID = z.enum(IDS_TEMPLATES as [IdTemplate, ...IdTemplate[]]);

/** Nova versão aprovada (sênior/admin): só as variáveis permitidas do modelo; a anterior fica no histórico. */
export const salvarVersaoMensagem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: ID, texto: z.string().min(1).max(6000), motivo: z.string().max(200).optional() }))
  .handler(async ({ data, context }) => {
    if (!(await ehGestor(context.supabase, context.userId))) throw new Error('Só advogada sênior ou admin aprova novas versões das mensagens oficiais.');
    if (!versaoValida(data.id, data.texto)) throw new Error(`O texto só pode usar estas variáveis: ${variaveisPermitidas(data.id).join(', ') || 'nenhuma'}.`);
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const b = await gravar(context.supabase, context.userId, autor, atual => {
      const lista = atual.versoes?.[data.id] ?? [];
      const versao = Math.max(TEMPLATES_OFICIAIS[data.id].versao, ...lista.map(v => v.versao)) + 1;
      return { ...atual, versoes: { ...atual.versoes, [data.id]: [...lista, { versao, texto: data.texto, autor, em: new Date().toISOString(), ...(data.motivo ? { motivo: data.motivo } : {}) }] } };
    }, `Nova versão aprovada do modelo ${data.id}`);
    return { ok: true as const, versao: templateVigente(data.id, b).versao };
  });

/** Ativação (sênior/admin). A consulta paga (07.2/07.3) só fica ativa na versão escolhida pela advogada. */
export const alterarAtivacaoMensagem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: ID, ativacao: z.enum(['ativo', 'manual', 'aguardando_aprovacao']) }))
  .handler(async ({ data, context }) => {
    if (!(await ehGestor(context.supabase, context.userId))) throw new Error('Só advogada sênior ou admin altera a ativação das mensagens oficiais.');
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    const b = await gravar(context.supabase, context.userId, autor, atual => {
      if ((data.id === 'T07.2' || data.id === 'T07.3') && data.ativacao === 'ativo' && atual.consultaPaga !== data.id) throw new Error('Escolha primeiro qual versão da consulta paga (07.2 ou 07.3) está autorizada.');
      return { ...atual, ativacao: { ...atual.ativacao, [data.id]: data.ativacao } };
    }, `Modelo ${data.id}: ${data.ativacao}`);
    return { ok: true as const, ativacao: templateVigente(data.id, b).ativacao };
  });

/** Versão comercial da consulta paga autorizada pela advogada (ou nenhuma). A outra versão nunca fica ativa. */
export const definirConsultaPaga = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ versao: z.enum(['T07.2', 'T07.3']).nullable() }))
  .handler(async ({ data, context }) => {
    if (!(await ehGestor(context.supabase, context.userId))) throw new Error('Só advogada sênior ou admin define a consulta paga.');
    const autor = await nomeDoUsuario(context.supabase, context.userId);
    await gravar(context.supabase, context.userId, autor, atual => {
      const ativacao = { ...atual.ativacao };
      // Trocar a versão autorizada desliga a outra; nenhuma fica ativa sem nova ativação explícita.
      for (const id of ['T07.2', 'T07.3'] as const) if (id !== data.versao && ativacao[id] === 'ativo') ativacao[id] = 'aguardando_aprovacao';
      return { ...atual, consultaPaga: data.versao, ativacao };
    }, `Consulta paga autorizada: ${data.versao ?? 'nenhuma'}`);
    return { ok: true as const };
  });
