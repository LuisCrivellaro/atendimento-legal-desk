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
  podeEnviarAnexo,
  podeGerenciarCanal,
  resumoEnvio,
  sanitizarConfig,
  validarTextoEnvio,
  type CanalConfig,
  type ContatoTeste,
} from './canal-envio';
import { normalizarTelefone } from './telefone';
import { numeroWhatsAppAtendido } from './production-channel';
import { conferirWebhookWhatsApp, urlPublicaApp, urlWebhookWhatsApp } from './url-publica';
import { concluirEnvioEquipe, falhaAmbigua, falharEnvioEquipe, reservarEnvioEquipe, type DecisaoReserva } from './envio-equipe';
import { ultramsgAdapter } from './canais/ultramsg';
import { enviarTextoTelegram } from './canais/telegram';
import { destinoTelegram, lerDestinoTelegram } from './telegram-bots';
import { autorizaEnvioAna } from './ana-execution';
import { defaultAutomations } from '../atendimento';
import type { Conversa, Mensagem } from '../mock-data';

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
  return sanitizarConfig((r.data as CanalConfig | null) ?? configPadrao);
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

/** Entrada do WhatsApp aberta? Lida no servidor com o cliente privilegiado; qualquer falha fecha (só a lista vale). */
async function entradaWhatsAppAberta(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { donaEntradaWhatsApp } = await import('./entrada-whatsapp.server');
    const dona = await donaEntradaWhatsApp(supabaseAdmin);
    return !!dona.ownerId;
  } catch {
    return false;
  }
}

interface EnvioBase {
  mensagemOrigem?: string | undefined;
  controleHumanoEm?: string | undefined;
  permitirEncaminhamento?: boolean | undefined;
  conversaId: string;
  acao: string;
  texto: string;
  contatoEsperado?: string;
  /** Horários ofertados viram botões clicáveis no Telegram. */
  horarios?: string[] | undefined;
  /** Conta da Dra. (e-mail verificado no login): envia a qualquer contato liberado, sem a lista de números. */
  contaMaster?: boolean;
}

/** Destino WhatsApp da conversa: contato liberado e vinculado, restrições de produção e credenciais. Mesmo para texto e anexo. */
async function destinoUltramsg(supabase: Db, ator: Ator, entrada: Pick<EnvioBase, 'conversaId' | 'acao' | 'contatoEsperado' | 'contaMaster'>) {
  const destino = await supabase.from('atendimento_contatos_teste').select('contato_externo,telefone_ficticio,status').eq('conversa_id',entrada.conversaId).eq('canal','ultramsg').eq('status','liberado').maybeSingle();
  if (destino.error) throw new Error('Destino indisponível ou ambíguo; nada foi enviado.');
  const contato = destino.data;
  if (entrada.contatoEsperado && contato?.contato_externo !== entrada.contatoEsperado) throw new Error('Vínculo do contato alterado; envio interrompido.');
  if (!contato) {
    await auditar(supabase, ator, entrada.acao, 'Envio recusado: contato WhatsApp não liberado', 'bloqueado');
    throw new Error('Contato de WhatsApp não liberado para esta conversa. Nada foi enviado.');
  }
  const entradaAberta = entrada.contaMaster === true || await entradaWhatsAppAberta();
  if (!numeroWhatsAppAtendido(contato.contato_externo, entradaAberta)) throw new Error('Número não autorizado nesta fase de produção.');
  if (!process.env['ULTRAMSG_TOKEN'] || !process.env['ULTRAMSG_INSTANCE_ID']) throw new Error('WhatsApp não configurado. Nada foi enviado.');
  return { contato, entradaAberta };
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
    const destino = await supabase.from('atendimento_contatos_teste').select('contato_externo,telefone_ficticio').eq('conversa_id', entrada.conversaId).eq('canal', 'telegram').eq('status', 'liberado').maybeSingle();
    if (destino.error) throw new Error('Destino indisponível ou ambíguo; nada foi enviado.');
    const contato = destino.data;
    if (entrada.contatoEsperado && contato?.contato_externo !== entrada.contatoEsperado) throw new Error('Vínculo do contato alterado; envio interrompido.');
    if (!contato) {
      await auditar(supabase, ator, entrada.acao, 'Envio recusado: contato Telegram não liberado', 'bloqueado');
      throw new Error('Contato de Telegram não liberado para esta conversa. Nada foi enviado.');
    }
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    if (!token) throw new Error('Telegram não configurado. Nada foi enviado.');
    const resultado = await enviarTextoTelegram(lerDestinoTelegram(contato.contato_externo).chatId, entrada.texto, token);
    if (!resultado.ok) {
      await auditar(supabase, ator, entrada.acao, 'Falha no envio pelo Telegram', 'erro', resultado.erro);
      throw new Error('O envio pelo Telegram não foi concluído. Nada foi registrado como enviado.');
    }
    await auditar(supabase, ator, entrada.acao, resumoEnvio('telegram', contato.contato_externo, contato.telefone_ficticio, entrada.texto.length), 'sucesso');
    return { ok: true as const, simulado: false as const, canal: 'telegram' as const, idExterno: resultado.idExterno };
  }

  if (config.canal_ativo === 'ultramsg') {
    const { contato, entradaAberta } = await destinoUltramsg(supabase, ator, entrada);
    if(entrada.acao==='sistema:ana'){
      const { atualizarConversa } = await import('./ana.server');
      const owner=await supabase.from('casos').select('owner_id').eq('id',entrada.conversaId).single();
      if(owner.error)throw new Error('Conversa indisponível.');
      const ws=await supabase.from('office_workspace').select('dados').eq('owner_id',owner.data.owner_id).maybeSingle();
      const state=ws.data?.dados as {anaPausa?:{ativa?:boolean};automations?:{modoIA?:string}}|undefined;
      if(ws.error||state?.anaPausa?.ativa||!config.agente_ativo)throw Object.assign(new Error('Ana pausada; envio interrompido.'),{code:'ana_envio_bloqueado'});
      let autorizada=false;
      await atualizarConversa(supabase,entrada.conversaId,c=>{
        autorizada=false;
        const origem=entrada.mensagemOrigem??c.mensagens.at(-1)?.id;
        if(!origem||(c.modoIA??state?.automations?.modoIA??defaultAutomations.modoIA)!=='Automática'||!autorizaEnvioAna(c,origem,entrada.controleHumanoEm,entrada.permitirEncaminhamento))return c;
        autorizada=true;
        return {...c,agenteAna:{...c.agenteAna,envioAna:{mensagemId:origem,texto:entrada.texto,desde:new Date().toISOString()}},mensagens:c.mensagens.map(m=>m.id===origem&&m.iaExecucao?{...m,iaExecucao:{...m.iaExecucao,estado:'enviando' as const}}:m)};
      });
      if(!autorizada)throw Object.assign(new Error('Conversa assumida ou alterada; Ana não enviou.'),{code:'ana_envio_bloqueado'});
      const latest=await supabase.from('casos').select('dados').eq('id',entrada.conversaId).single();
      const c=latest.data?.dados as unknown as Conversa|undefined;
      const origem=entrada.mensagemOrigem??c?.mensagens.at(-1)?.id;
      if(latest.error||!c||!origem||!autorizaEnvioAna(c,origem,entrada.controleHumanoEm,entrada.permitirEncaminhamento))throw Object.assign(new Error('Conversa assumida; Ana não enviou.'),{code:'ana_envio_bloqueado'});
    }
    const resultado = await ultramsgAdapter.enviarTexto(contato.contato_externo, entrada.texto, { ...(entrada.horarios?.length ? { botoes: botoesHorarios(entrada.horarios) } : {}), entradaAberta });
    if (!resultado.ok) {
      await auditar(supabase, ator, entrada.acao, 'Falha no envio pelo WhatsApp', 'erro', resultado.erro);
      throw new Error('O envio pelo WhatsApp não foi concluído. Nada foi registrado como enviado.');
    }
    await auditar(supabase, ator, entrada.acao, resumoEnvio('whatsapp', contato.contato_externo, contato.telefone_ficticio, entrada.texto.length), 'sucesso');
    return { ok: true as const, simulado: false as const, canal: 'ultramsg' as const, idExterno: resultado.idExterno };
  }

  throw new Error('Canal indisponível.');
}

/** Envio pela equipe: exige usuário autenticado do escritório. */
export const enviarMensagemCanal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), acao: z.string().min(1).max(60), texto: z.string().max(16000), horarios: z.array(z.string().datetime()).max(8).optional() }))
  .handler(async ({ data, context }) => {
    const ator = await atorDoUsuario(context.supabase, context.userId);
    const { atualizarConversa } = await import('./ana.server');
    await atualizarConversa(context.supabase,data.conversaId,c=>({...c,agenteAna:{...c.agenteAna,humano:true,controleHumanoEm:new Date().toISOString(),proximoPasso:'Equipe assumiu esta conversa. Retomar Ana exige ação explícita.'}}));
    const email = String((context.claims as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
    return enviarComRegras(context.supabase, ator, { ...data, contaMaster: email === 'chamanalei@gmail.com' });
  });

/**
 * Texto da equipe pelo Atendimento, em um passo só: reserva a mensagem na conversa com o id gerado no navegador
 * (já assume a conversa e pausa a Anne), envia pelas mesmas regras de enviarComRegras e grava o recibo do canal.
 * Nova tentativa com o mesmo id devolve a já enviada; reserva em andamento ou falha incerta nunca reenvia sozinha.
 * Falhas voltam como resultado (não exceção) para a tela saber se pode haver chegado ao cliente.
 */
export const enviarMensagemEquipe = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), mensagemId: z.string().uuid(), texto: z.string().min(1).max(4096), automatico: z.boolean().optional(), reenvioConferido: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    const email = String((context.claims as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
    const problema = validarTextoEnvio(data.texto);
    if (problema) return { ok: false as const, erro: problema, ambiguo: false };
    const ator = await atorDoUsuario(context.supabase, context.userId);
    const autor = data.automatico ? 'IA (automático)' : (ator.nome !== 'usuário' ? ator.nome : email || 'Atendente');
    const { atualizarConversa } = await import('./ana.server');
    let decisao: DecisaoReserva | undefined;
    try {
      await atualizarConversa(context.supabase, data.conversaId, c => {
        decisao = reservarEnvioEquipe(c, { id: data.mensagemId, texto: data.texto, autor, agora: new Date(), reenvioConferido: data.reenvioConferido });
        return decisao.acao === 'reservar' ? decisao.conversa : c;
      });
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : 'Conversa indisponível.', ambiguo: false };
    }
    const d = decisao as DecisaoReserva | undefined;
    if (!d) return { ok: false as const, erro: 'Conversa indisponível.', ambiguo: false };
    if (d.acao === 'jaEnviada') return { ok: true as const, repetida: true, mensagem: d.mensagem };
    if (d.acao === 'emAndamento') return { ok: false as const, erro: 'Esta mensagem já está sendo enviada.', ambiguo: true };
    if (d.acao === 'conferir') return { ok: false as const, erro: 'O envio anterior não foi confirmado e pode ter chegado ao cliente. Confira o WhatsApp antes de reenviar.', ambiguo: true };
    const tReserva = Date.now();
    try {
      const r = await enviarComRegras(context.supabase, ator, { conversaId: data.conversaId, acao: 'enviarMensagem', texto: data.texto, contaMaster: email === 'chamanalei@gmail.com' });
      const tCanal = Date.now();
      const final = await atualizarConversa(context.supabase, data.conversaId, c => concluirEnvioEquipe(c, data.mensagemId, { status: r.simulado === false ? 'enviada' : 'simulada', canal: r.canal, idExterno: 'idExterno' in r ? r.idExterno : undefined }));
      // Log estruturado sem texto nem telefone: onde o tempo foi gasto (banco, provedor, banco).
      console.log(JSON.stringify({ evento: 'envio_equipe', canal: r.canal, reservaMs: tReserva - t0, canalMs: tCanal - tReserva, conclusaoMs: Date.now() - tCanal, totalMs: Date.now() - t0 }));
      return { ok: true as const, repetida: false, mensagem: final.mensagens.find(m => m.id === data.mensagemId) };
    } catch (e) {
      const erro = e instanceof Error ? e.message : 'O envio não foi concluído.';
      const ambiguo = falhaAmbigua(erro);
      await atualizarConversa(context.supabase, data.conversaId, c => falharEnvioEquipe(c, data.mensagemId, erro, ambiguo, new Date())).catch(() => undefined);
      console.log(JSON.stringify({ evento: 'envio_equipe_falhou', ambiguo, totalMs: Date.now() - t0 }));
      return { ok: false as const, erro, ambiguo };
    }
  });

/**
 * Anexo guardado pela equipe → cliente, pelo WhatsApp. Só depois da prévia e da confirmação na tela.
 * O arquivo sai do Storage privado por URL assinada de 10 minutos (nunca pública). Reserva antes do envio;
 * só vira "enviada" com o recibo do canal. Canal desligado: nada sai e o anexo continua "guardado".
 */
export const enviarAnexoCanal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ conversaId: z.string().uuid(), mensagemId: z.string().min(1).max(120), legenda: z.string().max(1024).optional(), reenvioConferido: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const ator = await atorDoUsuario(context.supabase, context.userId);
    const { atualizarConversa } = await import('./ana.server');
    const row = await context.supabase.from('casos').select('dados').eq('id', data.conversaId).eq('owner_id', context.userId).maybeSingle();
    if (row.error || !row.data) throw new Error('Atendimento indisponível para seu usuário.');
    const c = row.data.dados as unknown as Conversa;
    const m = c.mensagens.find(x => x.id === data.mensagemId);
    if (!m || m.de !== 'escritorio' || !m.path || !m.arquivo) throw new Error('Anexo não encontrado nesta conversa.');
    if (!m.path.startsWith(`${context.userId}/${data.conversaId}/`)) throw new Error('Arquivo fora deste caso.');
    if (m.status && m.status !== 'simulada') throw new Error('Este anexo já foi enviado.');
    if (!podeEnviarAnexo(m.envioAnexo, data.reenvioConferido === true)) throw new Error(m.envioAnexo?.falhouEm ? 'O envio anterior não foi confirmado e pode ter chegado ao cliente. Confira a conversa no WhatsApp e confirme o reenvio.' : 'Este anexo já está em envio. Confira a conversa antes de repetir.');
    const legenda = data.legenda?.trim() ?? '';
    const problema = legenda ? validarTextoEnvio(legenda) : undefined;
    if (problema) throw new Error(problema);
    const config = await carregarConfig(context.supabase);
    if (config.canal_ativo !== 'ultramsg') throw new Error('WhatsApp não está ativo. O anexo continua guardado e não foi enviado ao cliente.');
    const { contato, entradaAberta } = await destinoUltramsg(context.supabase, ator, { conversaId: data.conversaId, acao: 'enviarAnexo' });
    const agora = new Date().toISOString();
    let reservado = false;
    await atualizarConversa(context.supabase, data.conversaId, x => {
      reservado = false;
      const alvo = x.mensagens.find(y => y.id === data.mensagemId);
      if (!alvo || !podeEnviarAnexo(alvo.envioAnexo, data.reenvioConferido === true) || (alvo.status && alvo.status !== 'simulada')) return x;
      reservado = true;
      // Envio da equipe assume a conversa, como qualquer mensagem manual.
      return { ...x, agenteAna: { ...x.agenteAna, humano: true, controleHumanoEm: agora, proximoPasso: 'Equipe assumiu esta conversa. Retomar Ana exige ação explícita.' }, mensagens: x.mensagens.map(y => y.id === data.mensagemId ? { ...y, envioAnexo: { reservadoEm: agora } } : y) };
    });
    if (!reservado) throw new Error('Este anexo já está em envio. Confira a conversa antes de repetir.');
    // Só libera quando com certeza nada saiu; falha no canal mantém a reserva (o arquivo pode ter chegado).
    const marcar = (envioAnexo: Mensagem['envioAnexo']) => atualizarConversa(context.supabase, data.conversaId, x => ({ ...x, mensagens: x.mensagens.map(y => y.id === data.mensagemId ? { ...y, envioAnexo } : y) }));
    const assinada = await context.supabase.storage.from('case-documents').createSignedUrl(m.path, 600);
    if (assinada.error || !assinada.data?.signedUrl) { await marcar(m.envioAnexo?.falhouEm ? m.envioAnexo : undefined); throw new Error('Não foi possível preparar o arquivo. Nada foi enviado.'); }
    const { enviarArquivoUltramsg } = await import('./canais/ultramsg');
    const imagem = m.tipo === 'imagem' || /\.(jpe?g|png|webp)$/i.test(m.arquivo);
    const r = await enviarArquivoUltramsg(contato.contato_externo, { tipo: imagem ? 'imagem' : 'documento', url: assinada.data.signedUrl, nome: m.arquivo, legenda }, { instancia: process.env['ULTRAMSG_INSTANCE_ID'] ?? '', token: process.env['ULTRAMSG_TOKEN'] ?? '' }, entradaAberta);
    if (!r.ok) {
      await marcar({ reservadoEm: agora, falhouEm: new Date().toISOString() });
      await auditar(context.supabase, ator, 'enviarAnexo', 'Falha no envio de anexo pelo WhatsApp', 'erro', r.erro);
      throw new Error('O envio pelo WhatsApp não foi confirmado. O anexo continua guardado; confira a conversa do cliente antes de tentar de novo.');
    }
    await atualizarConversa(context.supabase, data.conversaId, x => ({
      ...x,
      mensagens: x.mensagens.map(y => y.id === data.mensagemId ? { ...y, ...(legenda ? { texto: legenda } : {}), canal: 'ultramsg', idExterno: r.idExterno, status: 'enviada' as const, envioAnexo: { reservadoEm: agora, enviadoEm: new Date().toISOString() } } : y),
      timeline: [...x.timeline, { data: new Date().toISOString(), evento: `Anexo enviado ao cliente pelo WhatsApp: ${m.arquivo}` }],
    }));
    await auditar(context.supabase, ator, 'enviarAnexo', resumoEnvio('whatsapp', contato.contato_externo, contato.telefone_ficticio, legenda.length), 'sucesso');
    return { ok: true as const, idExterno: r.idExterno };
  });

/** Envio pelo sistema (agente/lembretes): só chamável no servidor, pronto para a fase 3. Ainda não usado. */
export async function enviarMensagemSistema(deps: { supabase: Db; conversaId: string; texto: string; motivo: string; contatoEsperado?:string; horarios?: string[]; mensagemOrigem?:string; controleHumanoEm?:string|undefined; permitirEncaminhamento?:boolean }) {
  return enviarComRegras(
    deps.supabase,
    { nome: 'agente', perfil: 'sistema' },
    { conversaId: deps.conversaId, acao: `sistema:${deps.motivo}`.slice(0, 60), texto: deps.texto,mensagemOrigem:deps.mensagemOrigem,controleHumanoEm:deps.controleHumanoEm,permitirEncaminhamento:deps.permitirEncaminhamento, ...(deps.contatoEsperado?{contatoEsperado:deps.contatoEsperado}:{}), ...(deps.horarios?.length?{horarios:deps.horarios}:{}) },
  );
}

/** Ponto único de envio ao cliente pelo sistema: escolhe o canal ativo (hoje Telegram, depois UltraMsg). */
export async function enviarAoCliente(supabase: Db, conversaId: string, texto: string) {
  return enviarComRegras(supabase, { nome: 'Ana', perfil: 'sistema' }, { conversaId, acao: 'sistema:ana', texto });
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
        ultramsg: Boolean(process.env['ULTRAMSG_TOKEN']?.trim() && process.env['ULTRAMSG_INSTANCE_ID']?.trim()),
      },
    };
  });

export const salvarConfigCanal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    canal_ativo: z.enum(['desligado', 'ultramsg', 'telegram']),
    fonte_sugestoes: z.enum(['ia_manager', 'agente']),
    agente_ativo: z.boolean().optional(),
  }))
  .handler(async ({ data, context }) => {
    if (data.canal_ativo === 'telegram' && !process.env['TELEGRAM_BOT_TOKEN']) throw new Error('Token do bot do Telegram ausente.');
    if (data.canal_ativo === 'ultramsg' && (!process.env['ULTRAMSG_TOKEN'] || !process.env['ULTRAMSG_INSTANCE_ID'])) throw new Error('Credenciais do UltraMsg ausentes.');
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
    canal: z.enum(['ultramsg', 'telegram']).default('ultramsg'),
    contatoExterno: z.string().max(120).optional(),
    nome: z.string().max(120).default(''),
    telefoneFicticio: z.string().max(20),
    status: z.enum(['aguardando_liberacao', 'liberado', 'bloqueado']),
    conversaId: z.string().uuid().nullable().optional(),
  }))
  .handler(async ({ data, context }) => {
    const ator = await exigirGestor(context.supabase, context.userId);
    if (data.canal !== 'ultramsg') throw new Error('Telegram retirado do atendimento.');
    // Na edição, a lista exibe o telefone mascarado: valor com '•' significa "manter o já salvo".
    let telefone = normalizarTelefone(data.telefoneFicticio);
    if (data.id && data.telefoneFicticio.includes('•')) {
      const atual = await context.supabase.from('atendimento_contatos_teste').select('telefone_ficticio').eq('id', data.id).maybeSingle();
      telefone = atual.data?.telefone_ficticio ?? '';
    }
    if (data.status === 'liberado') {
      const atual = data.id ? await context.supabase.from('atendimento_contatos_teste').select('contato_externo,canal').eq('id', data.id).maybeSingle() : undefined;
      const destino = atual?.data?.contato_externo ?? data.contatoExterno ?? '';
      if (atual?.error || (atual?.data && atual.data.canal !== 'ultramsg') || !numeroWhatsAppAtendido(destino, await entradaWhatsAppAberta())) throw new Error('Número não autorizado nesta fase de produção.');
    }
    if (telefone.length < 12) throw new Error('Informe o telefone fictício com DDD.');
    if (!data.id && !(data.contatoExterno ?? '').trim()) throw new Error(data.canal === 'ultramsg' ? 'Informe o número de WhatsApp.' : 'Informe o chat_id do Telegram.');
    if (data.conversaId) {
      const caso = await context.supabase.from('casos').select('id').eq('id', data.conversaId).maybeSingle();
      if (caso.error || !caso.data) throw new Error('Conversa não encontrada para vincular.');
      const outros = await context.supabase.from('atendimento_contatos_teste').select('id').eq('conversa_id', data.conversaId).eq('canal', data.canal).eq('status', 'liberado');
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
          contato_externo: data.canal === 'ultramsg' ? normalizarTelefone(data.contatoExterno ?? '') : destinoTelegram(data.bot, (data.contatoExterno ?? '').trim()),
        });
    if (r.error) throw new Error('Não foi possível salvar o contato de teste.');
    await auditar(context.supabase, ator, 'salvarContatoTeste', `${data.nome.trim() || 'contato'} · ${data.status}`, 'sucesso');
    return { ok: true as const };
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

/** Registra no UltraMsg o endereço que recebe as mensagens do WhatsApp. Só sênior/admin. */
export const registrarWebhookUltramsg = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ator = await exigirGestor(context.supabase, context.userId);
    const inst = process.env['ULTRAMSG_INSTANCE_ID'], token = process.env['ULTRAMSG_TOKEN'], secret = process.env['ULTRAMSG_WEBHOOK_SECRET'];
    if (!inst || !token || !secret) throw new Error('Credenciais do UltraMsg ausentes.');
    const base = urlPublicaApp(process.env['PUBLIC_APP_URL']);
    const r = await fetch(`https://api.ultramsg.com/${encodeURIComponent(inst)}/instance/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, webhook_url: urlWebhookWhatsApp(base, secret), webhook_message_received: 'true', webhook_message_create: 'true', webhook_message_ack: 'false', webhook_message_download_media: 'true' }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      await auditar(context.supabase, ator, 'registrarWebhookUltramsg', 'Falha ao registrar webhook', 'erro', `HTTP ${r.status}`);
      throw new Error(`O UltraMsg não confirmou o registro (HTTP ${r.status}).`);
    }
    // Leitura de volta: só declara registrado o que o UltraMsg devolve.
    const lido = await fetch(`https://api.ultramsg.com/${encodeURIComponent(inst)}/instance/settings?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) })
      .then(x => x.json() as Promise<{ webhook_url?: string }>).catch(() => undefined);
    const conf = conferirWebhookWhatsApp(String(lido?.webhook_url ?? ''), base, secret);
    if (!conf.correto) {
      await auditar(context.supabase, ator, 'registrarWebhookUltramsg', 'Registro sem confirmação na leitura de volta', 'erro', conf.motivo);
      throw new Error(`O UltraMsg aceitou o pedido, mas a leitura de volta não confirmou o endereço (${conf.motivo ?? 'sem detalhe'}).`);
    }
    await auditar(context.supabase, ator, 'registrarWebhookUltramsg', `Webhook WhatsApp registrado em ${conf.host}`, 'sucesso');
    return { ok: true as const, descricao: `Recebimento de mensagens do WhatsApp registrado em ${conf.host}.` };
  });

/** Estado da instância (conectada ao celular ou não). */
export const verificarUltramsg = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase, context.userId);
    const inst = process.env['ULTRAMSG_INSTANCE_ID'], token = process.env['ULTRAMSG_TOKEN'];
    if (!inst || !token) throw new Error('Credenciais do UltraMsg ausentes.');
    const [r, cfg] = await Promise.all([
      fetch(`https://api.ultramsg.com/${encodeURIComponent(inst)}/instance/status?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) }),
      fetch(`https://api.ultramsg.com/${encodeURIComponent(inst)}/instance/settings?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) })
        .then(x => x.json() as Promise<{ webhook_url?: string }>).catch(() => undefined),
    ]);
    const corpo = (await r.json().catch(() => undefined)) as { status?: { accountStatus?: { status?: string; substatus?: string } }; error?: unknown } | undefined;
    if (!r.ok || !corpo?.status) throw new Error(`Não foi possível verificar o WhatsApp (HTTP ${r.status}).`);
    // Nunca devolve o segredo: só o host e se confere com o app publicado.
    const conf = cfg ? conferirWebhookWhatsApp(String(cfg.webhook_url ?? ''), urlPublicaApp(process.env['PUBLIC_APP_URL']), process.env['ULTRAMSG_WEBHOOK_SECRET'] ?? '') : undefined;
    return {
      status: corpo.status.accountStatus?.status ?? 'desconhecido', substatus: corpo.status.accountStatus?.substatus ?? '',
      webhook: conf ? { correto: conf.correto, host: conf.host, motivo: conf.motivo ?? null } : null,
    };
  });

/** Legacy calls fail closed; Telegram cannot be reactivated. */
export const registrarWebhookTelegram = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async () => { throw new Error('Telegram retirado do atendimento.'); });
export const verificarTelegram = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async () => ({ registrado: false, pendentes: 0, erro: 'Telegram retirado do atendimento.' }));

/** Entrada do WhatsApp do escritório (celular próprio): lida na área de trabalho de quem abriu. Só sênior/admin. */
export const lerEntradaWhatsApp = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase, context.userId);
    const ws = await context.supabase.from('office_workspace').select('dados').eq('owner_id', context.userId).maybeSingle();
    if (ws.error) throw new Error('Não foi possível ler a entrada do WhatsApp.');
    const entrada = (ws.data?.dados as { entradaWhatsApp?: { ativa?: boolean; atualizadoEm?: string } } | null)?.entradaWhatsApp;
    return { ativa: entrada?.ativa === true, atualizadoEm: entrada?.atualizadoEm ?? '' };
  });

/** Abre ou fecha a entrada: com ela aberta, quem escrever no WhatsApp do escritório ganha conversa na conta de quem abriu. */
export const salvarEntradaWhatsApp = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ativa: z.boolean() }))
  .handler(async ({ data, context }) => {
    const ator = await exigirGestor(context.supabase, context.userId);
    const entradaWhatsApp = { ativa: data.ativa, atualizadoEm: new Date().toISOString() };
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const row = await context.supabase.from('office_workspace').select('dados,updated_at').eq('owner_id', context.userId).maybeSingle();
      if (row.error) throw new Error('Não foi possível salvar a entrada do WhatsApp.');
      const dados = { ...((row.data?.dados as Record<string, unknown> | null) ?? {}), entradaWhatsApp };
      const r = row.data
        ? await context.supabase.from('office_workspace').update({ dados: dados as never, updated_at: new Date().toISOString() }).eq('owner_id', context.userId).eq('updated_at', row.data.updated_at).select('owner_id')
        : await context.supabase.from('office_workspace').insert({ owner_id: context.userId, dados: dados as never }).select('owner_id');
      if (r.error) throw new Error('Não foi possível salvar a entrada do WhatsApp.');
      if (r.data?.length) {
        await auditar(context.supabase, ator, 'salvarEntradaWhatsApp', data.ativa ? 'Entrada do WhatsApp aberta: novos contatos atendidos pela Ana' : 'Entrada do WhatsApp fechada: só contatos liberados', 'sucesso');
        return entradaWhatsApp;
      }
    }
    throw new Error('Área de trabalho alterada ao mesmo tempo. Tente de novo.');
  });
