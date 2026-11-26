import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Checklist trabalhista oficial (T09): só a equipe dona da conversa, com confirmação explícita de que o caso é
 * trabalhista (a Anne nunca decide isso por palavras da conversa). Execução em `checklist-trabalhista.server.ts`.
 */
export const enviarChecklistTrabalhistaAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), confirmarTrabalhista: z.literal(true) }))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const row = await db.from('casos').select('owner_id').eq('id', data.conversaId).single();
    if (row.error || row.data.owner_id !== context.userId) throw new Error('Conversa indisponível para esta conta.');
    const perfil = await db.from('profiles').select('nome').eq('id', context.userId).maybeSingle();
    const autor = String(perfil.data?.nome ?? 'equipe').slice(0, 80);
    const { executarChecklistT09 } = await import('./checklist-trabalhista.server');
    return executarChecklistT09(db, { conversaId: data.conversaId, ownerId: context.userId, autor });
  });
