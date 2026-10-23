import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqual } from 'node:crypto';
import type { Mensagem } from '@/lib/mock-data';
import { z } from 'zod';
import { mascararContato } from '@/lib/atendimento/canal-envio';
import { classificarEntrada } from '@/lib/atendimento/intake-rules';
import { destinoTelegram } from '@/lib/atendimento/telegram-bots';
import { horarioDoClique, textoEscolhaHorario } from '@/lib/atendimento/botoes-horario';

/** Responde ao clique e remove os botões para evitar cliques repetidos. Falhas aqui não bloqueiam o fluxo. */
async function fecharClique(token: string | undefined, id: string, chatId: number, messageId: number | undefined, texto: string) {
  if (!token) return;
  const api = (m: string, body: unknown) => fetch(`https://api.telegram.org/bot${token}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
  await api('answerCallbackQuery', { callback_query_id: id, text: texto });
  if (messageId) await api('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

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
  document?: { file_id?: string; file_name?: string; mime_type?: string; file_size?: number };
  photo?: { file_id?: string; file_size?: number }[];
}


const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
/** Baixa o anexo do Telegram, guarda o original no caso e copia à pasta do cliente no Drive, se já criada. */
async function guardarAnexoTelegram(admin: any, m: TelegramMessage, caso: { id: string; owner_id: string; dados: unknown }) {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  const foto = m.photo?.at(-1);
  const fileId = m.document?.file_id ?? foto?.file_id;
  const tamanho = m.document?.file_size ?? foto?.file_size ?? 0;
  if (!token || !fileId || tamanho > 10 * 1024 * 1024) return undefined;
  const mime = m.document ? (m.document.mime_type ?? '') : 'image/jpeg';
  if (!MIMES.includes(mime)) return undefined;
  try {
    const info = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)).json() as { ok?: boolean; result?: { file_path?: string } };
    if (!info.ok || !info.result?.file_path) return undefined;
    const r = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 10 * 1024 * 1024) return undefined;
    const nome = (m.document?.file_name ?? `foto_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`).replace(/[\\/]/g, '_').slice(0, 200);
    const path = `${caso.owner_id}/${caso.id}/${crypto.randomUUID()}/${nome}`;
    const up = await admin.storage.from('case-documents').upload(path, bytes, { upsert: false, contentType: mime });
    if (up.error) return undefined;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const ws = await admin.from('office_workspace').select('dados').eq('owner_id', caso.owner_id).maybeSingle();
    if (ws.data?.dados) {
      const dados = ws.data.dados as { casos?: Record<string, { arquivos?: unknown[] }> };
      const casos = { ...(dados.casos ?? {}) };
      const atual = casos[caso.id] ?? {};
      casos[caso.id] = { ...atual, arquivos: [...(atual.arquivos ?? []), { id: crypto.randomUUID(), nome, path, hash, mime, bytes: bytes.length, revisado: false, contrato: false }] };
      await admin.from('office_workspace').update({ dados: { ...dados, casos } }).eq('owner_id', caso.owner_id);
    }
    let driveUrl: string | undefined;
    const pasta = (caso.dados as { pastaDrive?: { id?: string } })?.pastaDrive?.id;
    if (pasta) {
      try { const { enviarArquivo } = await import('@/lib/atendimento/google-drive.server'); driveUrl = (await enviarArquivo(pasta, nome, mime, bytes)).url; } catch { /* original preservado no caso */ }
    }
    return { nome, path, driveUrl };
  } catch { return undefined; }
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

        const parsed = z.object({update_id:z.number().int().optional(),message:z.object({message_id:z.number().int(),text:z.string().max(16000).optional(),chat:z.object({id:z.number().int()})}).passthrough().optional(),edited_message:z.unknown().optional(),callback_query:z.object({id:z.string().max(128),data:z.string().max(64).optional(),message:z.object({message_id:z.number().int(),chat:z.object({id:z.number().int()})}).passthrough().optional()}).passthrough().optional()}).safeParse(await request.json().catch(()=>null));
        if(!parsed.success)return Response.json({ok:true,ignorado:true});
        const update = parsed.data as TelegramUpdate;
        if(update.edited_message)return Response.json({ok:true,ignorado:true});
        const clique = parsed.data.callback_query;
        const mensagem: TelegramMessage | undefined = update.message ?? (clique?.message ? { message_id: clique.message.message_id, chat: { id: clique.message.chat.id }, text: '' } : undefined);
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
          .select('id,owner_id,dados')
          .eq('id', contato.data.conversa_id)
          .maybeSingle();
        if (caso.error || !caso.data) {
          await auditar('mensagemRecebida', 'Conversa vinculada não encontrada', 'erro', caso.error?.message ?? null);
          return Response.json({ ok: true, ignorado: true });
        }

        let textoClique: string | undefined;
        if (clique) {
          const atual = caso.data.dados as unknown as { horariosOfertados?: string[]; agenteAna?: { horariosTeste?: string[]; agendaReal?: boolean } };
          const ofertados = [...(atual.agenteAna?.agendaReal ? atual.agenteAna.horariosTeste ?? [] : []), ...(atual.horariosOfertados ?? [])];
          const iso = horarioDoClique(clique.data, ofertados);
          await fecharClique(process.env['TELEGRAM_BOT_TOKEN'], clique.id, mensagem.chat.id, clique.message?.message_id, iso ? 'Horário recebido ✅' : 'Esse horário não está mais disponível.');
          if (!iso) { await auditar('mensagemRecebida', 'Clique em horário inválido ou vencido', 'bloqueado'); return Response.json({ ok: true, ignorado: true }); }
          textoClique = textoEscolhaHorario(iso);
          mensagem.text = textoClique;
        }
        const tipo = mensagem.text ? 'texto' : mensagem.audio ? 'audio' : mensagem.document ? 'arquivo' : mensagem.photo ? 'imagem' : 'arquivo';
        const agora = new Date();
        const novaMensagem: Mensagem = {
          id: clique ? `telegram:${destino}:cb${clique.id}` : `telegram:${destino}:${mensagem.message_id}`,
          de: 'cliente',
          texto: mensagem.text ?? '',
          arquivo: tipo === 'texto' ? undefined : `[${tipo} recebido pelo Telegram]`,
          hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          dataHora: agora.toISOString(),
          canal: 'telegram',
          idExterno: clique ? `cb${clique.id}` : String(mensagem.message_id),
        };
        if (tipo === 'arquivo' || tipo === 'imagem') {
          const salvo = await guardarAnexoTelegram(supabaseAdmin, mensagem, caso.data as { id: string; owner_id: string; dados: unknown });
          if (salvo) { novaMensagem.arquivo = salvo.nome; novaMensagem.path = salvo.path; novaMensagem.salvoStart = true; novaMensagem.tipo = tipo === 'imagem' ? 'imagem' : 'documento'; novaMensagem.driveUrl = salvo.driveUrl; }
          await auditar('anexoRecebido', salvo ? `Anexo guardado${salvo.driveUrl ? ' e copiado ao Google Drive' : ''}` : 'Anexo não pôde ser baixado', salvo ? 'sucesso' : 'erro');
        }
        const {atualizarConversa,processarAna}=await import('@/lib/atendimento/ana.server');
        try {
          await atualizarConversa(supabaseAdmin,caso.data.id,current=>current.mensagens.some(m=>m.id===novaMensagem.id)?current:classificarEntrada({...current,mensagens:[...current.mensagens,novaMensagem]}));
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
