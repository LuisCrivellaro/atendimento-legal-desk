import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Conversa } from '../mock-data';
import { gerarHorarios, DURACAO_RETORNO } from './schedule-rules';
import { operacaoExpirada } from './appointment-management';

/**
 * Agenda real para as ações da equipe no Atendimento (mesma agenda oficial do ProJuris usada pela Anne).
 * Só o dono do atendimento; nada é simulado: sem agenda, nenhum horário é mostrado.
 */
export const horariosLivresEquipe = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ casoId: z.string().uuid(), tipo: z.enum(['novo', 'cadastrado']) }))
  .handler(async ({ data, context }) => {
    const row = await context.supabase.from('casos').select('id').eq('id', data.casoId).eq('owner_id', context.userId).maybeSingle();
    if (row.error || !row.data) throw new Error('Atendimento indisponível para seu usuário.');
    const { ocupadosAgenda } = await import('./projuris-agenda.server');
    const agora = new Date();
    const busy = await ocupadosAgenda(context.supabase, context.userId, agora, 21);
    if (!busy) return { slots: [] as string[], aviso: 'Agenda do ProJuris indisponível agora; nenhum horário verificado. Tente de novo em instantes.' };
    const slots = gerarHorarios(busy, agora, data.tipo, 12, 21);
    return { slots, ...(slots.length ? {} : { aviso: 'Nenhum horário livre dentro das regras nas próximas 3 semanas.' }) };
  });

/**
 * Reserva feita pela equipe: grava o recibo real (consulta inicial ou retorno de cliente da casa) e avisa o cliente
 * pelo canal central. Tudo no servidor, para um salvamento antigo do navegador nunca desfazer o recibo.
 */
export const reservarHorarioEquipe = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ casoId: z.string().uuid(), inicio: z.string().datetime(), finalidade: z.enum(['consulta', 'retorno']), texto: z.string().min(1).max(1200) }))
  .handler(async ({ data, context }) => {
    const { atualizarConversa } = await import('./ana.server');
    const { reservarAgenda } = await import('./projuris-agenda.server');
    const { enviarMensagemSistema } = await import('./envio.functions');
    const { newMessage, formatarHorarioCliente } = await import('../atendimento');
    const row = await context.supabase.from('casos').select('dados').eq('id', data.casoId).eq('owner_id', context.userId).single();
    if (row.error) throw new Error('Atendimento indisponível para seu usuário.');
    const c = row.data.dados as unknown as Conversa;
    const tipo = data.finalidade === 'retorno' ? 'cadastrado' as const : c.tipoClienteAgenda ?? c.agenteAna?.tipoCliente;
    if (!tipo) throw new Error('Confirme a carteira de agendamento do cliente (novo ou cadastrado) antes de reservar.');
    if (c.consultaAgendada && Date.parse(c.consultaAgendada) > Date.now()) throw new Error('Já existe consulta marcada; remarque ou cancele a atual antes de reservar outra.');
    const nome = (c.agenteAna?.dados?.nome || c.nome || '').trim();
    const telefone = c.agenteAna?.telefone || c.telefone;
    const [contact, profile] = await Promise.all([
      context.supabase.from('atendimento_contatos_teste').select('contato_externo').eq('conversa_id', data.casoId).eq('canal', 'ultramsg').eq('status', 'liberado').maybeSingle(),
      context.supabase.from('profiles').select('nome').eq('id', context.userId).maybeSingle(),
    ]);
    const operacao = crypto.randomUUID();
    let claimed = false;
    await atualizarConversa(context.supabase, data.casoId, x => {
      claimed = false;
      if ((x.agenteAna?.operacaoConsulta && !operacaoExpirada(x.agenteAna.operacaoConsulta)) || (x.consultaAgendada && Date.parse(x.consultaAgendada) > Date.now())) return x;
      claimed = true;
      return { ...x, agenteAna: { ...x.agenteAna, operacaoConsulta: { mensagemId: operacao, eventoId: 'nova', tipo: 'remarcar', desde: new Date().toISOString() } } };
    });
    if (!claimed) throw new Error('Consulta alterada ou operação de agenda em andamento; atualize a conversa.');
    let reserva: Awaited<ReturnType<typeof reservarAgenda>>;
    try {
      reserva = await reservarAgenda(context.supabase, context.userId, data.casoId, data.inicio, new Date(), { nome, telefone, tipo });
    } catch (error) {
      await atualizarConversa(context.supabase, data.casoId, x => ({ ...x, agenteAna: { ...x.agenteAna, operacaoConsulta: undefined } }));
      throw error instanceof Error ? error : new Error('Reserva não confirmada na agenda.');
    }
    const autor = profile.data?.nome ?? 'Atendente';
    await atualizarConversa(context.supabase, data.casoId, x => ({
      ...x,
      consultaAgendada: reserva.inicio,
      horariosOfertados: [],
      ...(data.finalidade === 'retorno' ? { retornoAgendado: reserva.inicio, retornoDuracao: DURACAO_RETORNO } : {}),
      agenteAna: { ...x.agenteAna, operacaoConsulta: undefined, reservaCalendar: reserva, alteracaoConsulta: undefined, autorizacaoRemarcacao: undefined, horarioPendente: undefined, horarioPendenteDesde: undefined, horariosTeste: [], agendaReal: false },
      timeline: [...x.timeline, { data: new Date().toISOString(), evento: `${data.finalidade === 'retorno' ? 'Retorno' : 'Consulta'} reservado(a) na agenda do ProJuris por ${autor} · ${formatarHorarioCliente(reserva.inicio)}` }],
    }));
    await context.supabase.rpc('registrar_audit_log', { p_ator: autor, p_perfil: 'equipe', p_acao: 'reservarHorarioEquipe', p_resumo: `${data.finalidade} · compromisso confirmado · ${reserva.inicio}`, p_status: 'sucesso' });
    // Link só quando o Google devolveu um endereço HTTPS; nunca inventado.
    const meet = reserva.meetUrl && /^https:\/\//.test(reserva.meetUrl) ? reserva.meetUrl : undefined;
    const texto = `${data.texto.trim()}\n${formatarHorarioCliente(reserva.inicio)}${meet ? `\nLink da reunião: ${meet}` : ''}`;
    let avisoEnviado = false;
    try {
      if (!contact.data) throw new Error('Contato de WhatsApp não liberado para esta conversa.');
      const sent = await enviarMensagemSistema({ supabase: context.supabase, conversaId: data.casoId, texto, motivo: 'reservaEquipe', contatoEsperado: contact.data.contato_externo });
      await atualizarConversa(context.supabase, data.casoId, x => ({ ...x, mensagens: [...x.mensagens, newMessage(texto, { autor, ...(sent.simulado ? { status: 'simulada' as const } : { canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada' as const }) })] }));
      avisoEnviado = !sent.simulado;
    } catch (error) {
      console.error('Reserva feita; aviso ao cliente não concluído', error);
      await atualizarConversa(context.supabase, data.casoId, x => ({ ...x, iaRetida: texto, agenteAna: { ...x.agenteAna, erro: 'Horário reservado; aviso ao cliente não confirmado. Revise e envie manualmente.' } }));
    }
    return { inicio: reserva.inicio, meet: !!meet, avisoEnviado };
  });
