import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
export const atualizarTarefaRetorno = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ conversaId: z.string().uuid(), tarefaId: z.string().max(250), respostaId: z.string().max(250).optional() })).handler(async ({ data, context }) => {
 const { atualizarConversa } = await import('./ana.server');
 const row = await context.supabase.from('casos').select('owner_id').eq('id', data.conversaId).eq('owner_id', context.userId).single();
 if (row.error || !row.data) throw new Error('Atendimento indisponível para este responsável.');
 await atualizarConversa(context.supabase, data.conversaId, c => {
  const tarefa = c.tarefasRetorno?.find(t => t.id === data.tarefaId && t.responsavelId === context.userId);
  if (!tarefa) throw new Error('Tarefa indisponível.');
  const resposta = data.respostaId ? c.mensagens.find(m => m.id === data.respostaId && m.de === 'escritorio' && !m.respostaAnaDe && !m.apagadaParaTodos && ['enviada', 'entregue', 'lida'].includes(m.status ?? '') && Date.parse(m.dataHora ?? '') >= Date.parse(tarefa.criadaEm)) : undefined;
  if (data.respostaId && !resposta) throw new Error('Selecione uma resposta real da equipe enviada após a tarefa.');
  return { ...c, tarefasRetorno: c.tarefasRetorno?.map(t => t.id === tarefa.id ? { ...t, reconhecidaEm: new Date().toISOString(), ...(resposta ? { status: 'atendida' as const, atendidaEm: new Date().toISOString(), respostaId: resposta.id } : {}) } : t) };
 });
 return { ok: true };
});
