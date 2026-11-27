import { createServerFn } from '@tanstack/react-start';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database, Json } from '@/integrations/supabase/types';

/**
 * Auditoria da fila do advogado (Fernando) para sênior/admin: resultado da última verificação de todas as conversas,
 * prévia do relatório corrigido, nova verificação sob demanda (nunca envia nada aos clientes) e envio do relatório
 * corrigido ao advogado só depois da verificação, dentro do expediente. Leituras de todo o escritório passam pelo
 * servidor (perfil conferido), como no painel do escritório.
 */
type Db = SupabaseClient<Database>;

export const MOTIVO_RELATORIO_VAZIO = 'Relatório das 09h de 27/11/2026: a fila do advogado só recebia pendências criadas pela Anne a partir de mensagens novas, depois da publicação e em modo Automático. Pedidos anteriores, conversas em atendimento humano (Híbrido/Humano) e contatos que não passaram pela identificação nunca entravam na fila, e o relatório não verificava as conversas antes de enviar: lista vazia virava "não há clientes aguardando". Agora todas as conversas são verificadas antes de cada relatório e falha de verificação nunca vira lista vazia.';

async function exigirGestor(supabase: Db, userId: string) {
  const [senior, admin] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'advogada_senior' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  if (!senior.data && !admin.data) throw new Error('Só sênior/admin acessa a auditoria da fila do advogado.');
  const perfil = await supabase.from('profiles').select('nome').eq('id', userId).maybeSingle();
  return String(perfil.data?.nome ?? 'equipe').slice(0, 80);
}

async function montarPrevia(admin: Db, supabase: Db, userId: string, agora: Date) {
  const { lerEstadoReconciliacao } = await import('./reconciliacao-advogado.server');
  const { destinatariosRelatorio, pendenciasDoDestinatario } = await import('./relatorio-advogado.server');
  const { lerConfigEncaminhamento } = await import('./secretaria/encaminhamento-config');
  const { textoRelatorioAdvogado } = await import('./encaminhamento-advogado');
  const { urlPublicaApp } = await import('./url-publica');
  const [estado, proprio, todos] = await Promise.all([
    lerEstadoReconciliacao(admin),
    supabase.from('office_workspace').select('dados').eq('owner_id', userId).maybeSingle(),
    admin.from('office_workspace').select('owner_id,dados'),
  ]);
  if (todos.error) throw new Error('Configuração indisponível.');
  const cfg = lerConfigEncaminhamento((proprio.data?.dados as { secretaria?: { encaminhamento?: unknown } } | null)?.secretaria?.encaminhamento);
  const { lista, configPorOwner } = destinatariosRelatorio((todos.data ?? []) as { owner_id: string; dados: unknown }[]);
  const destinatario = lista.find(d => d.numero === cfg.whatsapp) ?? lista[0];
  const base = urlPublicaApp(process.env['PUBLIC_APP_URL']);
  const { itens, deCliente } = destinatario ? await pendenciasDoDestinatario(admin, destinatario, configPorOwner, base, agora) : { itens: [], deCliente: false };
  const ult = estado.ultimaCompleta;
  const verificacao = ult
    ? { completa: true, naoVerificadas: ult.naoVerificadas, ...(ult.ok ? {} : { falha: ult.falha ?? 'falhas durante a verificação' }) }
    : { completa: false, naoVerificadas: 0, falha: 'verificação ainda não executada' };
  const texto = textoRelatorioAdvogado(itens, agora, destinatario?.responsavel ?? cfg.responsavel, verificacao, `${base}/atendimento`);
  return { estado, destinatario, itens, deCliente, texto, verificacao };
}

export const lerAuditoriaFilaAdvogado = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const p = await montarPrevia(supabaseAdmin, context.supabase, context.userId, new Date());
    const exemplos = [...(p.estado.ultimaCompleta?.exemplos.ambiguas ?? []), ...(p.estado.ultimaCompleta?.exemplos.antigas ?? []), ...(p.estado.ultimaCompleta?.exemplos.naoVerificadas ?? [])];
    const nomes = new Map<string, string>();
    if (exemplos.length) {
      const r = await supabaseAdmin.from('casos').select('id,nome').in('id', [...new Set(exemplos.map(e => e.conversaId))]);
      for (const x of (r.data ?? []) as { id: string; nome: string }[]) nomes.set(x.id, x.nome);
    }
    const comNome = (l: { conversaId: string; motivo: string; desde?: string | undefined }[] | undefined) => (l ?? []).map(e => ({ ...e, nome: nomes.get(e.conversaId) ?? 'Conversa' }));
    const u = p.estado.ultimaCompleta;
    return {
      motivo: MOTIVO_RELATORIO_VAZIO,
      ultima: u ? { iniciadaEm: u.iniciadaEm, concluidaEm: u.concluidaEm, ok: u.ok, falha: u.falha ?? null, analisadas: u.analisadas, contagem: u.contagem, naoVerificadas: u.naoVerificadas, foraDoWhatsApp: u.foraDoWhatsApp ?? 0, criadas: u.criadas, atualizadas: u.atualizadas } : null,
      emAndamento: p.estado.emAndamento ? { iniciadaEm: p.estado.emAndamento.iniciadaEm, analisadas: p.estado.emAndamento.analisadas } : null,
      ambiguas: comNome(u?.exemplos.ambiguas), antigas: comNome(u?.exemplos.antigas), naoVerificadas: comNome(u?.exemplos.naoVerificadas),
      previa: p.texto,
      pendentes: p.itens.length,
      destinatario: p.destinatario ? { responsavel: p.destinatario.responsavel, numero: p.destinatario.numero } : null,
      destinatarioDeCliente: p.deCliente,
    };
  });

/** Verifica todas as conversas agora (continua a passagem dos últimos 10 min, se houver). Não envia nada. */
export const verificarFilaAdvogado = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const autor = await exigirGestor(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { reconciliarFilaAdvogado } = await import('./reconciliacao-advogado.server');
    const agora = new Date();
    const r = await reconciliarFilaAdvogado(supabaseAdmin, agora, { inicioMinimo: new Date(agora.getTime() - 10 * 60000).toISOString(), limiteMs: 40000 });
    await context.supabase.rpc('registrar_audit_log', { p_ator: autor, p_perfil: 'equipe', p_acao: 'reconciliacaoAdvogado', p_resumo: `Verificação da fila do advogado ${r.completa ? 'concluída' : 'parcial (continuar)'}: ${r.resumo.analisadas} conversa(s), ${r.resumo.contagem.pendente} pendente(s), ${r.resumo.contagem.ambigua} para conferir`, p_status: r.completa && r.ok ? 'sucesso' : 'erro' });
    return { completa: r.completa, ok: r.ok, analisadas: r.resumo.analisadas };
  });

/** Envia ao advogado o relatório corrigido (prévia conferida), só com verificação recente e dentro do expediente. */
export const enviarRelatorioAdvogadoAgora = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const autor = await exigirGestor(context.supabase, context.userId);
    const { dentroDoExpedienteRelatorio, diaSP, horaSP } = await import('./encaminhamento-advogado');
    const agora = new Date();
    if (!dentroDoExpedienteRelatorio(agora)) throw new Error('Fora do expediente: o advogado só recebe mensagens de segunda a sexta, das 09:00 às 17:30, fora de feriado nacional.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const p = await montarPrevia(supabaseAdmin, context.supabase, context.userId, agora);
    const u = p.estado.ultimaCompleta;
    if (!u || agora.getTime() - Date.parse(u.concluidaEm) > 20 * 60000) throw new Error('Execute "Verificar todas as conversas" antes de enviar (a verificação precisa ter menos de 20 minutos).');
    if (!p.destinatario) throw new Error('Nenhum WhatsApp de advogado configurado.');
    if (p.deCliente) throw new Error('O número configurado pertence a um contato de cliente; envio bloqueado.');
    const id = `relatorio-advogado-manual:${p.destinatario.numero}:${diaSP(agora)}T${horaSP(agora)}`;
    const reserva = await supabaseAdmin.from('ana_monitoramento').insert({ id, estado: { estado: 'enviando', por: autor, em: agora.toISOString() } as unknown as Json, verificado_em: agora.toISOString() });
    if (reserva.error) throw new Error('Um relatório acabou de ser enviado neste minuto; aguarde antes de enviar de novo.');
    const { enviarTextoResponsavel } = await import('./canais/ultramsg');
    const r = await enviarTextoResponsavel(p.destinatario.numero, p.texto);
    await supabaseAdmin.from('ana_monitoramento').update({ estado: { estado: r.ok ? 'enviado' : r.ambiguo ? 'incerto' : 'falhou', por: autor, em: agora.toISOString(), pendentes: p.itens.length, ...(r.erro ? { erro: r.erro } : {}) } as unknown as Json }).eq('id', id);
    await context.supabase.rpc('registrar_audit_log', { p_ator: autor, p_perfil: 'equipe', p_acao: 'relatorioAdvogado', p_resumo: `Relatório corrigido enviado manualmente a ${p.destinatario.responsavel}: ${p.itens.length} pendente(s)`, p_status: r.ok ? 'sucesso' : 'erro', ...(r.ok ? {} : { p_erro: r.erro ?? 'Envio não confirmado.' }) });
    if (!r.ok) throw new Error(r.ambiguo ? 'O WhatsApp não confirmou o envio (pode ter saído). Confira com o Fernando antes de reenviar.' : (r.erro ?? 'Envio recusado.'));
    return { ok: true as const, pendentes: p.itens.length };
  });
