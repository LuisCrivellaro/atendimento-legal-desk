import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Conversa } from '../mock-data';

/** Resumo do Atendimento da conta (audiências, perícias, aprovações, documentos, modelos aguardando a Dra.). */
export const lerResumoPainelAnne = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [ws, casos] = await Promise.all([
      context.supabase.from('office_workspace').select('dados').eq('owner_id', context.userId).maybeSingle(),
      context.supabase.from('casos').select('id,nome,dados').eq('owner_id', context.userId),
    ]);
    if (ws.error || casos.error) throw new Error('Resumo indisponível.');
    const { lerBiblioteca } = await import('./biblioteca/renderizar');
    const { resumoPainel } = await import('./painel-atendimento');
    return resumoPainel((casos.data ?? []) as unknown as { id: string; nome: string; dados: Conversa }[], lerBiblioteca((ws.data?.dados as { bibliotecaMensagens?: unknown } | null)?.bibliotecaMensagens), new Date());
  });
