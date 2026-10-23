import { createServerFn } from '@tanstack/react-start';
import { botoesHorarios } from './botoes-horario';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  configPadrao,
  decidirEnvio,
  mascararContato,
  podeGerenciarCanal,
  resumoEnvio,
  sanitizarConfig,
  validarTextoEnvio,
  type CanalConfig,
  type ContatoTeste,
} from './canal-envio';
import { normalizarTelefone } from './telefone';
import { telegramAdapter } from './canais/telegram';
import { destinoTelegram, lerDestinoTelegram } from './telegram-bots';

type Db = SupabaseClient<Database>;

interface Ator {
  nome: string;
  perfil: string;
}

async function carregarConfig(supabase: Db): Promise<CanalConfig> {
  const r = await supabase
    .from('atendimento_canal_config')
    .select('canal_ativo,modo_teste,agente_ativo,fonte_sugestoes')
    .eq('id', true)
    .maybeSingle();
  if (r.error) throw new Error('Configuração do canal indisponível.');
  return (r.data as CanalConfig | null) ?? configPadrao;
}

async function auditar(
  supabase: Db,
  ator: Ator,
  acao: string,
  resumo: string,
  status: 'sucesso' | 'erro' | 'bloqueado',
  erro?: string,
): Promise<void> {
  await supabase.rpc('registrar_audit_log', {
    p_ator: ator.nome,
    p_perfil: ator.perfil,
    p_acao: acao,
    p_resumo: resumo,
    p_status: status,
    ...(erro ? { p_erro: erro } : {}),
  });
}

async function atorDoUsuario(supabase: Db, userId: string): Promise<Ator> {
  const [perfil, roles] = await Promise.all([
    supabase.from('profiles').select('nome').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ]);
  return { nome: perfil.data?.nome ?? 'usuário', perfil: (roles.data ?? []).map((r) => r.role).join(', ') };
}

async function exigirGestor(supabase: Db, userId: string): Promise<Ator> {
  const [senior, admin] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'advogada_senior' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  if (!senior.data && !admin.data) throw new Error('Seu perfil não permite esta ação.');
  return atorDoUsuario(supabase, userId);
}

interface EnvioBase {
  conversaId: string;
  acao: string;
  texto: string;
  contatoEsperado?: string;
  /** Horários ofertados viram botões clicáveis no Telegram. */
  horarios?: string[];
}

/** Núcleo do envio: vale para mensagens da equipe e do sistema. O destino é sempre buscado no servidor. */
async function enviarComRegras(supabase: Db, ator: Ator, entrada: EnvioBase) {
  const problema = validarTextoEnvio(entrada.texto);
  if (problema) {
    await auditar(supabase, ator, entrada.acao, 'Texto bloqueado antes do envio', 'bloqueado', problema);
    throw new Error(problema);
  }
  const caso = await supabase.from('casos').select('id').eq('id', entrada.conversaId).maybeSingle();
  if (caso.error || !caso.data) throw new Error('Conversa indisponível.');
  const config = await carregarConfig(supabase);

  // Canal desligado: modo demonstração atual, sem chamada externa.
  if (decidirEnvio(config, null).simulado && config.canal_ativo === 'desligado') {
    await auditar(supabase, ator, entrada.acao, `Simulado · ${entrada.texto.length} caracteres`, 'sucesso');
    return { ok: true as const, simulado: true as const, canal: 'simulador' as const };
  }

  if (config.canal_ativo === 'telegram') {
    const destino = await supabase.from('atendimento_contatos_teste').select('contato_externo,telefone_ficticio,status').eq('conversa_id',entrada.conversaId).eq('canal','telegram').eq('status','liberado').maybeSingle();
    if(destino.error)throw new Error('Destino indisponível ou ambíguo; nada foi enviado.');
    const contato = destino.data;
    if(entrada.contatoEsperado&&contato?.contato_externo!==entrada.contatoEsperado)throw new Error('Vínculo do contato alterado; envio interrompido.');
    const decisao = decidirEnvio(config, contato?.status==='liberado'?{status:'liberado'}:null);
    if (!decisao.permitido || !contato) {
      const motivo = decisao.motivo ?? 'Modo teste: contato não liberado. Nada foi enviado.';
      await auditar(supabase, ator, entrada.acao, 'Envio recusado pelo modo teste', 'bloqueado', motivo);
      throw new Error(motivo);
    }
    const destinoBot = lerDestinoTelegram(contato.contato_externo);
    const token = destinoBot.bot === 'segundo' ? process.env['TELEGRAM_BOT_TOKEN_2'] : process.env['TELEGRAM_BOT_TOKEN'];
    if (!token) {
      await auditar(supabase, ator, entrada.acao, 'Telegram não configurado', 'erro', 'Secret ausente');
      throw new Error('Telegram não configurado. Nada foi enviado.');
    }
    const resultado = await telegramAdapter.enviarTexto(destinoBot.chatId, entrada.texto, { token, ...(entrada.horarios?.length ? { botoes: botoesHorarios(entrada.horarios) } : {}) });
    if (!resultado.ok) {
      // Falha: nada é registrado como enviado; o token nunca aparece no erro.
      await auditar(supabase, ator, entrada.acao, 'Falha no envio pelo Telegram', 'erro', resultado.erro);
      throw new Error('O envio não foi concluído. Nada foi registrado como enviado.');
    }
    await auditar(supabase, ator, entrada.acao, resumoEnvio('telegram', contato.contato_externo, contato.telefone_ficticio, entrada.texto.length), 'sucesso');
    return { ok: true as const, simulado: false as const, canal: 'telegram' as const, idExterno: resultado.idExterno };
  }

  throw new Error('Canal indisponível.');
}

/** Envio pela equipe: exige usuário autenticado do escritório. */
export const enviarMensagemCanal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), acao: z.string().min(1).max(60), texto: z.string().max(16000), horarios: z.array(z.string().datetime()).max(8).optional() }))
  .handler(async ({ data, context }) => {
    const ator = await atorDoUsuario(context.supabase, context.userId);
    return enviarComRegras(context.supabase, ator, data);
  });

/** Envio pelo sistema (agente/lembretes): só chamável no servidor, pronto para a fase 3. Ainda não usado. */
export async function enviarMensagemSistema(deps: { supabase: Db; conversaId: string; texto: string; motivo: string; contatoEsperado?:string; horarios?: string[] }) {
  return enviarComRegras(
    deps.supabase,
    { nome: 'agente', perfil: 'sistema' },
    { conversaId: deps.conversaId, acao: `sistema:${deps.motivo}`.slice(0, 60), texto: deps.texto, ...(deps.contatoEsperado?{contatoEsperado:deps.contatoEsperado}:{}), ...(deps.horarios?.length?{horarios:deps.horarios}:{}) },
  );
}

export const lerConfigCanal = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const config = await carregarConfig(context.supabase);
    return {
      config,
      segredos: {
        telegram: Boolean(process.env['TELEGRAM_BOT_TOKEN']?.trim()),
        webhook: Boolean(process.env['TELEGRAM_WEBHOOK_SECRET']?.trim()),
        telegram2: Boolean(process.env['TELEGRAM_BOT_TOKEN_2']?.trim()),
        webhook2: Boolean(process.env['TELEGRAM_WEBHOOK_SECRET_2']?.trim()),
      },
    };
  });

export const salvarConfigCanal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    canal_ativo: z.enum(['desligado', 'telegram', 'ultramsg']),
    fonte_sugestoes: z.enum(['ia_manager', 'agente']),
    agente_ativo: z.boolean().optional(),
  }))
  .handler(async ({ data, context }) => {
    if (data.canal_ativo === 'ultramsg') throw new Error('WhatsApp UltraMsg estará disponível em breve.');
    const ator = await exigirGestor(context.supabase, context.userId);
    const atual = await carregarConfig(context.supabase);
    const config = sanitizarConfig({...data,agente_ativo:data.agente_ativo??atual.agente_ativo});
    const r = await context.supabase
      .from('atendimento_canal_config')
      .upsert({ id: true, ...config, atualizado_por: context.userId, atualizado_em: new Date().toISOString() });
    if (r.error) throw new Error('Não foi possível salvar a configuração.');
    await auditar(context.supabase, ator, 'salvarConfigCanal', `Canal: ${config.canal_ativo} · sugestões: ${config.fonte_sugestoes}`, 'sucesso');
    return config;
  });

export const listarContatosTeste = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase, context.userId);
    const r = await context.supabase
      .from('atendimento_contatos_teste')
      .select('id,canal,contato_externo,nome,telefone_ficticio,status,conversa_id,criado_em')
      .order('criado_em', { ascending: false });
    if (r.error) throw new Error('Não foi possível carregar os contatos de teste.');
    // chat_id e telefone sempre mascarados na tela
    return (r.data ?? []).map((c) => ({
      ...c,
      bot: lerDestinoTelegram(c.contato_externo).bot,
      contato_externo: mascararContato(c.contato_externo),
      telefone_ficticio: `••••${c.telefone_ficticio.slice(-4)}`,
    }));
  });

export const salvarContatoTeste = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid().optional(),
    bot: z.enum(['principal', 'segundo']).default('principal'),
    canal: z.enum(['telegram', 'simulador', 'ultramsg']).default('telegram'),
    contatoExterno: z.string().max(120).optional(),
    nome: z.string().max(120).default(''),
    telefoneFicticio: z.string().max(20),
    status: z.enum(['aguardando_liberacao', 'liberado', 'bloqueado']),
    conversaId: z.string().uuid().nullable().optional(),
  }))
  .handler(async ({ data, context }) => {
    const ator = await exigirGestor(context.supabase, context.userId);
    // Na edição, a lista exibe o telefone mascarado: valor com '•' significa "manter o já salvo".
    let telefone = normalizarTelefone(data.telefoneFicticio);
    if (data.id && data.telefoneFicticio.includes('•')) {
      const atual = await context.supabase.from('atendimento_contatos_teste').select('telefone_ficticio').eq('id', data.id).maybeSingle();
      telefone = atual.data?.telefone_ficticio ?? '';
    }
    if (telefone.length < 12) throw new Error('Informe o telefone fictício com DDD.');
    if (!data.id && !(data.contatoExterno ?? '').trim()) throw new Error('Informe o chat_id do Telegram.');
    if (data.conversaId) {
      const caso = await context.supabase.from('casos').select('id').eq('id', data.conversaId).maybeSingle();
      if (caso.error || !caso.data) throw new Error('Conversa não encontrada para vincular.');
      const outros = await context.supabase.from('atendimento_contatos_teste').select('id').eq('conversa_id', data.conversaId).eq('canal', 'telegram').eq('status', 'liberado');
      if (outros.error) throw new Error('Não foi possível verificar o vínculo.');
      if (data.status === 'liberado' && outros.data?.some(c => c.id !== data.id)) throw new Error('Esta conversa já tem um contato liberado; escolha outra conversa para separar os testes.');
    }
    const registro = {
      canal: data.canal,
      nome: data.nome.trim(),
      telefone_ficticio: telefone,
      status: data.status,
      conversa_id: data.conversaId ?? null,
    };
    const r = data.id
      ? await context.supabase.from('atendimento_contatos_teste').update(registro).eq('id', data.id)
      : await context.supabase.from('atendimento_contatos_teste').insert({
          ...registro,
          contato_externo: destinoTelegram(data.bot, (data.contatoExterno ?? '').trim()),
        });
    if (r.error) throw new Error('Não foi possível salvar o contato de teste.');
    await auditar(context.supabase, ator, 'salvarContatoTeste', `${data.nome.trim() || 'contato'} · ${data.status}`, 'sucesso');
    return { ok: true as const };
  });

const TELEGRAM_API = 'https://api.telegram.org/bot';

export const registrarWebhookTelegram = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ bot: z.enum(['principal', 'segundo']) }).default({ bot: 'principal' }))
  .handler(async ({ data, context }) => {
    const ator = await exigirGestor(context.supabase, context.userId);
    const token = data.bot === 'segundo' ? process.env['TELEGRAM_BOT_TOKEN_2'] : process.env['TELEGRAM_BOT_TOKEN'];
    const secret = data.bot === 'segundo' ? process.env['TELEGRAM_WEBHOOK_SECRET_2'] : process.env['TELEGRAM_WEBHOOK_SECRET'];
    if (!token || !secret) throw new Error('Secrets do Telegram não configurados.');
    const base = process.env['PUBLIC_APP_URL'] ?? 'https://atendimento-legal-desk.lovable.app';
    const resposta = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${base}/api/public/atendimento/telegram${data.bot === 'segundo' ? '?bot=segundo' : ''}`,
        secret_token: secret,
        allowed_updates: ['message', 'edited_message'],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const corpo = (await resposta.json().catch(() => undefined)) as { ok?: boolean; description?: string } | undefined;
    if (!resposta.ok || corpo?.ok !== true) {
      await auditar(context.supabase, ator, 'registrarWebhookTelegram', 'Falha ao registrar webhook', 'erro', `HTTP ${resposta.status}`);
      throw new Error(`O Telegram não confirmou o registro (HTTP ${resposta.status}).`);
    }
    await auditar(context.supabase, ator, 'registrarWebhookTelegram', 'Webhook registrado', 'sucesso');
    return { ok: true as const, descricao: corpo.description ?? 'Webhook registrado.' };
  });

export const verificarWebhookTelegram = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ bot: z.enum(['principal', 'segundo']) }).default({ bot: 'principal' }))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase, context.userId);
    const token = data.bot === 'segundo' ? process.env['TELEGRAM_BOT_TOKEN_2'] : process.env['TELEGRAM_BOT_TOKEN'];
    if (!token) throw new Error('Secret do Telegram não configurado.');
    const resposta = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`, { signal: AbortSignal.timeout(15000) });
    const corpo = (await resposta.json().catch(() => undefined)) as {
      ok?: boolean;
      result?: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number };
    } | undefined;
    if (!resposta.ok || corpo?.ok !== true) throw new Error('Não foi possível verificar o webhook.');
    const info = corpo.result ?? {};
    return {
      registrado: Boolean(info.url),
      pendentes: info.pending_update_count ?? 0,
      ultimoErro: info.last_error_message ?? null,
    };
  });

export const lerAuditLog = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase, context.userId);
    const r = await context.supabase
      .from('audit_log')
      .select('id,ator,perfil,acao,resumo,status,erro,criado_em')
      .order('criado_em', { ascending: false })
      .limit(100);
    if (r.error) throw new Error('Não foi possível carregar o log.');
    return r.data ?? [];
  });

export const registrarAuditoria = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    ator: z.string().max(60),
    perfil: z.string().max(60),
    acao: z.string().max(120),
    resumo: z.string().max(300).default(''),
    status: z.enum(['sucesso', 'erro']),
    erro: z.string().max(300).optional(),
  }))
  .handler(async ({ data, context }) => {
    await auditar(context.supabase, { nome: data.ator, perfil: data.perfil }, data.acao, data.resumo, data.status, data.erro);
    return { ok: true as const };
  });

// Referência mantida para verificação de tipos das regras puras no bundle do servidor.
void podeGerenciarCanal;
