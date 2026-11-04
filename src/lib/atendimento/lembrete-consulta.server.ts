import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { newMessage } from '../atendimento';
import { consultaDeHoje, mensagemLembreteAna } from './lembrete-consulta';
import { atualizarConversa } from './ana.server';

/**
 * Envia o lembrete do dia às consultas com recibo real do Calendar, uma única vez por consulta.
 * A resposta NÃO fica autorizada como cancelamento só depois do envio confirmado (consentimento ligado ao recibo e ao contato).
 */
export async function enviarLembretesConsulta(db: SupabaseClient<Database>, agora = new Date()) {
  const cfg = await db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id', true).single();
  if (cfg.error) throw new Error('Configuração indisponível.');
  if (cfg.data.canal_ativo !== 'ultramsg' || !cfg.data.agente_ativo) return { enviados: 0, motivo: 'canal ou Ana desligados' };
  const contatos = await db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado');
  if (contatos.error) throw new Error('Contatos indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  if (!porConversa.size) return { enviados: 0 };
  const rows = await db.from('casos').select('id,owner_id,dados').in('id', [...porConversa.keys()]);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  const { enviarMensagemSistema } = await import('./envio.functions');
  let enviados = 0, falhas = 0;
  for (const row of rows.data) {
    const c = row.dados as unknown as Conversa;
    const reserva = c.agenteAna?.reservaCalendar;
    if (!reserva || reserva.inicio !== c.consultaAgendada || !consultaDeHoje(c.consultaAgendada, agora)) continue;
    if (c.agenteAna?.lembreteConsulta?.inicio === reserva.inicio) continue;
    if (c.agenteAna?.humano || c.agenteAna?.pausa) continue;
    const contato = porConversa.get(row.id);
    const telefone = c.agenteAna?.telefone;
    if (!contato) continue;
    const texto = mensagemLembreteAna(c.agenteAna?.dados?.nome || '', reserva.inicio);
    // Reserva o lembrete antes da chamada externa: nunca reenviado automaticamente, mesmo após falha ambígua.
    let reservado = false;
    await atualizarConversa(db, row.id, x => {
      reservado = false;
      if (x.agenteAna?.lembreteConsulta?.inicio === reserva.inicio || x.consultaAgendada !== reserva.inicio) return x;
      reservado = true;
      return { ...x, agenteAna: { ...x.agenteAna, lembreteConsulta: { inicio: reserva.inicio, enviadoEm: agora.toISOString() }, envioAna: { mensagemId: `lembrete:${reserva.id}`, texto, desde: agora.toISOString() } } };
    });
    if (!reservado) continue;
    try {
      const sent = await enviarMensagemSistema({ supabase: db, conversaId: row.id, texto, motivo: 'lembrete', contatoEsperado: contato });
      if (sent.simulado) throw new Error('Canal desligado.');
      const fimDoDia = new Date(Date.parse(reserva.inicio) + 12 * 3600000).toISOString();
      await atualizarConversa(db, row.id, x => ({
        ...x,
        agenteAna: { ...x.agenteAna, ...(x.agenteAna?.reservaCalendar?.id === reserva.id && telefone ? { confirmacaoCancelamento: { eventoId: reserva.id, inicio: reserva.inicio, contato: telefone, expira: fimDoDia } } : {}) },
        mensagens: [...x.mensagens, newMessage(texto, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada' })],
        timeline: [...x.timeline, { data: agora.toISOString(), evento: 'Lembrete do dia da consulta enviado pela Ana' }],
      }));
      enviados++;
    } catch (error) {
      falhas++;
      console.error('Lembrete de consulta não enviado', error);
      await db.rpc('registrar_audit_log', { p_ator: 'Ana', p_perfil: 'sistema', p_acao: 'lembreteConsulta', p_resumo: 'Lembrete do dia não confirmado; equipe deve conferir', p_status: 'erro', p_erro: 'Envio do lembrete não confirmado.' });
    }
  }
  return { enviados, falhas };
}
