import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Mensagem } from '@/lib/mock-data';
import { mascararContato } from '@/lib/atendimento/canal-envio';
import { lerDestinoTelegram } from '@/lib/atendimento/telegram-bots';

export const AVISO_NAO_TEXTO = 'Recebi! Por enquanto consigo ler só mensagens escritas. Pode me mandar por texto?';

function seguroIgual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const Update = z.object({
  update_id: z.number().int(),
  message: z.object({
    message_id: z.number().int(),
    chat: z.object({ id: z.number().int() }),
    text: z.string().max(16000).optional(),
    caption: z.string().max(4000).optional(),
    voice: z.unknown().optional(), audio: z.unknown().optional(), photo: z.unknown().optional(),
    document: z.unknown().optional(), sticker: z.unknown().optional(), video: z.unknown().optional(),
  }).passthrough().optional(),
}).passthrough();

const tipoDe = (m: NonNullable<z.infer<typeof Update>['message']>) =>
  m.voice || m.audio ? 'audio' : m.photo ? 'imagem' : m.sticker ? 'figurinha' : m.video ? 'vídeo' : m.document ? 'documento' : 'mensagem';

export const Route = createFileRoute('/api/public/atendimento/telegram')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['TELEGRAM_WEBHOOK_SECRET'];
        if (!secret) return new Response('Não configurado', { status: 503 });
        if (!seguroIgual(request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', secret)) return new Response('Unauthorized', { status: 401 });
        const parsed = Update.safeParse(await request.json().catch(() => null));
        const msg = parsed.success ? parsed.data.message : undefined;
        if (!parsed.success || !msg) return Response.json({ ok: true, ignorado: true });

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const auditar = (acao: string, resumo: string, status: string) =>
          supabaseAdmin.rpc('registrar_audit_log', { p_ator: 'canal', p_perfil: 'telegram', p_acao: acao, p_resumo: resumo, p_status: status });
        try {
          const chatId = String(msg.chat.id);
          const config = await supabaseAdmin.from('atendimento_canal_config').select('canal_ativo').eq('id', true).maybeSingle();
          if (config.data?.canal_ativo !== 'telegram') { await auditar('mensagemRecebida', 'Telegram desligado · mensagem ignorada', 'bloqueado'); return Response.json({ ok: true, ignorado: true }); }
          const lista = await supabaseAdmin.from('atendimento_contatos_teste').select('conversa_id,contato_externo,status').eq('canal', 'telegram');
          const contato = (lista.data ?? []).find(c => { try { return lerDestinoTelegram(c.contato_externo).chatId === chatId; } catch { return false; } });
          if (!contato || contato.status !== 'liberado' || !contato.conversa_id) {
            await auditar('mensagemRecebida', `Contato Telegram não liberado · ${mascararContato(chatId)}`, 'bloqueado');
            return Response.json({ ok: true, ignorado: true });
          }
          const conversaId = contato.conversa_id;
          const id = `telegram:${chatId}:${parsed.data.update_id}`;
          const texto = msg.text ?? '';
          const tipo = texto ? 'texto' : tipoDe(msg);
          const agora = new Date();
          const nova: Mensagem = {
            id, de: 'cliente', texto: texto || msg.caption || '',
            ...(texto ? {} : { arquivo: `[${tipo} recebido pelo Telegram]` }),
            hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
            dataHora: agora.toISOString(), canal: 'telegram', idExterno: String(msg.message_id),
          };
          const { atualizarConversa } = await import('@/lib/atendimento/ana.server');
          let repetida = false;
          // Repetições do Telegram (mesmo update_id) são ignoradas.
          await atualizarConversa(supabaseAdmin, conversaId, c => { repetida = c.mensagens.some(m => m.id === id); return repetida ? c : { ...c, mensagens: [...c.mensagens, nova] }; });
          if (repetida) return Response.json({ ok: true, repetido: true });
          await auditar('mensagemRecebida', `Telegram ← ${mascararContato(chatId)} · ${tipo}`, 'sucesso');

          if (!texto) {
            const { enviarAoCliente } = await import('@/lib/atendimento/envio.functions');
            const { newMessage } = await import('@/lib/atendimento');
            const enviado = await enviarAoCliente(supabaseAdmin, conversaId, AVISO_NAO_TEXTO);
            await atualizarConversa(supabaseAdmin, conversaId, c => ({ ...c, mensagens: [...c.mensagens.map(m => m.id === id ? { ...m, iaProcessada: true } : m), newMessage(AVISO_NAO_TEXTO, { autor: 'ANA', canal: 'telegram', idExterno: enviado.idExterno, status: 'enviada' })] }));
            return Response.json({ ok: true });
          }
          const { processarAnaClaude } = await import('@/lib/atendimento/ana-claude.server');
          await processarAnaClaude(supabaseAdmin, conversaId, id, 'telegram');
        } catch (e) {
          await auditar('mensagemRecebida', `Falha ao processar mensagem do Telegram: ${(e as Error).message?.slice(0, 160) ?? ''}`, 'erro');
        }
        // Sempre 200: falhas ficam no log; o Telegram não deve reenviar.
        return Response.json({ ok: true });
      },
    },
  },
});
