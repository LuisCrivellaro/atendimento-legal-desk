import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Anexar transcrição ou resumo da consulta (arquivo do equipamento externo), só pela equipe dona da conversa.
 * Original no armazenamento privado; cópia em "1- Start" no Drive quando a pasta existe; texto para a Produção.
 */
export const anexarRegistroConsultaAnne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), tipo: z.enum(['transcricao', 'resumo']), nome: z.string().min(1).max(160), mime: z.string().max(120), base64: z.string().min(1).max(14_500_000) }))
  .handler(async ({ data, context }) => {
    const row = await context.supabase.from('casos').select('owner_id').eq('id', data.conversaId).single();
    if (row.error || row.data.owner_id !== context.userId) throw new Error('Conversa indisponível para esta conta.');
    const perfil = await context.supabase.from('profiles').select('nome').eq('id', context.userId).maybeSingle();
    const autor = String(perfil.data?.nome ?? 'equipe').slice(0, 80);
    const bytes = Uint8Array.from(atob(data.base64), ch => ch.charCodeAt(0));
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { anexarRegistroConsulta } = await import('./registro-consulta.server');
    return anexarRegistroConsulta(context.supabase, {
      guardar: async (path, b, mime) => {
        const up = await supabaseAdmin.storage.from('case-documents').upload(path, b, { upsert: false, contentType: mime });
        if (up.error) throw new Error('Arquivo não foi guardado; nada foi registrado.');
      },
      drive: async (pasta, nome, mime, b, chave, tipo) => {
        const { enviarArquivo } = await import('./google-drive.server');
        return enviarArquivo(pasta, nome, mime, b, { chave, tipo: tipo === 'transcricao' ? 'Transcrição da consulta' : 'Resumo da consulta', descricao: 'Registro da consulta enviado pela equipe' });
      },
    }, { conversaId: data.conversaId, ownerId: context.userId, autor, tipo: data.tipo, nome: data.nome, mime: data.mime, bytes });
  });
