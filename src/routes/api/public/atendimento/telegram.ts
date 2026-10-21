import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqual } from 'node:crypto';
import type { Database } from '@/integrations/supabase/types';
import { mascararContato } from '@/lib/atendimento/canal-envio';

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
        const secret = process.env['TELEGRAM_WEBHOOK_SECRET'];
        if (!secret) return new Response('Não configurado', { status: 503 });
        const recebido = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
        if (!seguroIgual(recebido, secret)) return new Response('Unauthorized', { status: 401 });

        const update = (await request.json().catch(() => undefined)) as TelegramUpdate | undefined;
        const mensagem = update?.message ?? update?.edited_message;
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
        const contato = await supabaseAdmin
          .from('atendimento_contatos_teste')
          .select('id,conversa_id,telefone_ficticio,status')
          .eq('canal', 'telegram')
          .eq('contato_externo', chatId)
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
        const dados = caso.data.dados as { mensagens?: Record<string, unknown>[] };
        const agora = new Date();
        const novaMensagem: Record<string, unknown> = {
          id: crypto.randomUUID(),
          de: 'cliente',
          texto: mensagem.text ?? '',
          arquivo: tipo === 'texto' ? undefined : `[${tipo} recebido pelo Telegram]`,
          hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          dataHora: agora.toISOString(),
          canal: 'telegram',
          idExterno: String(mensagem.message_id),
        };
        const novosDados = { ...dados, mensagens: [...(dados.mensagens ?? []), novaMensagem] } as Database['public']['Tables']['casos']['Row']['dados'];
        const atualizacao = await supabaseAdmin
          .from('casos')
          .update({ dados: novosDados })
          .eq('id', caso.data.id);
        if (atualizacao.error) {
          await auditar('mensagemRecebida', 'Falha ao gravar mensagem na conversa', 'erro', atualizacao.error.message);
          return Response.json({ error: 'Falha ao registrar' }, { status: 500 });
        }
        await auditar('mensagemRecebida', `Telegram ← ${mascararContato(chatId)} · ${tipo}`, 'sucesso');
        return Response.json({ ok: true });
      },
    },
  },
});
