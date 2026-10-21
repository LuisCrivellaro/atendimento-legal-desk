import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqual } from 'node:crypto';
import type { Mensagem } from '@/lib/mock-data';
import { z } from 'zod';
import { mascararContato } from '@/lib/atendimento/canal-envio';
import { destinoTelegram } from '@/lib/atendimento/telegram-bots';

function seguroIgual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

interface TelegramMessage {
  message_id?: number;
  text?: string;
  from?: { first_name?: string; last_name?: string };
  chat?: { id?: number };
  audio?: unknown;
  document?: unknown;
  photo?: unknown;
}

export const Route = createFileRoute('/api/public/atendimento/telegram')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botParam = new URL(request.url).searchParams.get('bot');
        if (botParam !== null && botParam !== 'segundo') return new Response('Invalid bot', { status: 400 });
        const bot = botParam === 'segundo' ? 'segundo' : 'principal';
        const secret = bot === 'segundo' ? process.env['TELEGRAM_WEBHOOK_SECRET_2'] : process.env['TELEGRAM_WEBHOOK_SECRET'];
        if (!secret) return new Response('Não configurado', { status: 503 });
        const recebido = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
        if (!seguroIgual(recebido, secret)) return new Response('Unauthorized', { status: 401 });

        const parsed = z.object({update_id:z.number().int().optional(),message:z.object({message_id:z.number().int(),text:z.string().max(16000).optional(),chat:z.object({id:z.number().int()})}).passthrough().optional(),edited_message:z.unknown().optional()}).safeParse(await request.json().catch(()=>null));
        if(!parsed.success)return Response.json({ok:true,ignorado:true});
        const update = parsed.data as TelegramUpdate;
        if(update.edited_message)return Response.json({ok:true,ignorado:true});
        const mensagem = update.message;
        if (!mensagem?.chat?.id || typeof mensagem.message_id !== 'number') {
          return Response.json({ ok: true, ignorado: true });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const auditar = (acao: string, resumo: string, status: string, erro: string | null = null) =>
          supabaseAdmin.rpc('registrar_audit_log', {
            p_ator: 'canal', p_perfil: 'telegram', p_acao: acao, p_resumo: resumo, p_status: status,
            ...(erro ? { p_erro: erro } : {}),
          });

        const config = await supabaseAdmin
          .from('atendimento_canal_config')
          .select('canal_ativo')
          .eq('id', true)
          .maybeSingle();
        if (config.data?.canal_ativo !== 'telegram') {
          await auditar('mensagemRecebida', 'Canal desligado · mensagem ignorada', 'bloqueado');
          return Response.json({ ok: true, ignorado: true });
        }

        const chatId = String(mensagem.chat.id);
        const destino = destinoTelegram(bot, chatId);
        const contato = await supabaseAdmin
          .from('atendimento_contatos_teste')
          .select('id,conversa_id,telefone_ficticio,status')
          .eq('canal', 'telegram')
          .eq('contato_externo', destino)
          .maybeSingle();

        if (!contato.data || contato.data.status !== 'liberado') {
          await auditar('mensagemRecebida', `Contato não liberado · ${mascararContato(chatId)}`, 'bloqueado');
          return Response.json({ ok: true, ignorado: true });
        }

        if (!contato.data.conversa_id) {
          await auditar('mensagemRecebida', `Sem conversa vinculada · ${mascararContato(chatId)}`, 'bloqueado');
          return Response.json({ ok: true, ignorado: true });
        }

        const caso = await supabaseAdmin
          .from('casos')
          .select('id,dados')
          .eq('id', contato.data.conversa_id)
          .maybeSingle();
        if (caso.error || !caso.data) {
          await auditar('mensagemRecebida', 'Conversa vinculada não encontrada', 'erro', caso.error?.message ?? null);
          return Response.json({ ok: true, ignorado: true });
        }

        const tipo = mensagem.text ? 'texto' : mensagem.audio ? 'audio' : mensagem.document ? 'arquivo' : mensagem.photo ? 'imagem' : 'arquivo';
        const agora = new Date();
        const novaMensagem: Mensagem = {
          id: `telegram:${destino}:${mensagem.message_id}`,
          de: 'cliente',
          texto: mensagem.text ?? '',
          arquivo: tipo === 'texto' ? undefined : `[${tipo} recebido pelo Telegram]`,
          hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          dataHora: agora.toISOString(),
          canal: 'telegram',
          idExterno: String(mensagem.message_id),
        };
        const {atualizarConversa,processarAna}=await import('@/lib/atendimento/ana.server');
        try {
          await atualizarConversa(supabaseAdmin,caso.data.id,current=>current.mensagens.some(m=>m.id===novaMensagem.id)?current:{...current,mensagens:[...current.mensagens,novaMensagem]});
        } catch {
          await auditar('mensagemRecebida','Falha ao gravar mensagem na conversa','erro');
          return Response.json({error:'Falha ao registrar'},{status:500});
        }
        await auditar('mensagemRecebida', `Telegram ← ${mascararContato(chatId)} · ${tipo}`, 'sucesso');
        await processarAna(supabaseAdmin,caso.data.id,novaMensagem.id,request);
        return Response.json({ ok: true });
      },
    },
  },
});
