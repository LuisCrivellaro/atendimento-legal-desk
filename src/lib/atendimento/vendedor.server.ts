import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { OfficeState } from '../office';
import { defaultAutomations, newMessage } from '../atendimento';
import { atualizarConversa } from './ana.server';
import { decidirFollowupVendedor, textoFollowupVendedor } from './vendedor';
import { listaHorariosAna, selecionarOpcoesAna, horizonteAgendaAna } from './ana-scheduling';
import { aplicarInstrucoesAgenda, automacaoSuspensa, lerInstrucoes } from './instrucoes-operacionais';

type Db = SupabaseClient<Database>;

/**
 * Follow-up do vendedor (desligado por padrão): um por oferta, com horários reais atualizados.
 * Sem agenda disponível, nada é enviado (nunca oferece horário inventado).
 */
export async function enviarFollowupsVendedor(db: Db, agora = new Date(), limite = 10) {
  const res = { enviados: 0, falhas: 0 };
  const cfg = await db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id', true).single();
  if (cfg.error || cfg.data.canal_ativo !== 'ultramsg' || !cfg.data.agente_ativo) return res;
  const ws = await db.from('office_workspace').select('owner_id,dados');
  if (ws.error) throw new Error('Automações indisponíveis.');
  const ligados = new Map<string, OfficeState>((ws.data ?? []).map(w => [w.owner_id, w.dados as unknown as OfficeState] as [string, OfficeState]).filter(([, s]) => (s?.automations?.vendedor ?? defaultAutomations.vendedor) === true));
  if (!ligados.size) return res;
  const rows = await db.from('casos').select('id,owner_id,dados').eq('etapa', 'inicial').in('owner_id', [...ligados.keys()]);
  if (rows.error) throw new Error('Atendimentos indisponíveis.');
  const ids = (rows.data ?? []).map(r => r.id);
  const contatos = ids.length ? await db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado').in('conversa_id', ids) : { data: [], error: null };
  if (contatos.error) throw new Error('Contatos indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  const { ocupadosAgenda } = await import('./projuris-agenda.server');
  const { enviarMensagemSistema } = await import('./envio.functions');
  for (const row of rows.data ?? []) {
    if (res.enviados >= limite) break;
    const c = row.dados as unknown as Conversa;
    const state = ligados.get(row.owner_id);
    const contato = porConversa.get(row.id);
    // Texto fixo com horários reais: a pausa da IA (chave recusada) não impede.
    if (!contato) continue;
    // Instrução operacional vigente suspendendo o vendedor: nada é enviado.
    const instrucoes = lerInstrucoes(state);
    if (automacaoSuspensa(instrucoes, 'vendedor', agora)) continue;
    const decisao = decidirFollowupVendedor({ ligado: true, conversa: c, modo: c.modoIA ?? state?.automations?.modoIA ?? defaultAutomations.modoIA }, agora);
    if (!decisao) continue;
    // Bloqueios/suspensões de agenda (ou de captação) das instruções vigentes: horário bloqueado nunca é oferecido.
    const busy = aplicarInstrucoesAgenda(await ocupadosAgenda(db, row.owner_id, agora, horizonteAgendaAna()), instrucoes, agora, 30, 'novo');
    if (!busy) continue;
    const slots = selecionarOpcoesAna(busy, agora, 'novo', '', c.agenteAna?.horariosApresentados ?? [], true).slots;
    if (!slots.length) continue;
    const texto = textoFollowupVendedor(c.agenteAna?.dados?.nome || '', listaHorariosAna(slots, agora, true));
    let reservado = false;
    await atualizarConversa(db, row.id, x => {
      reservado = false;
      if (!decidirFollowupVendedor({ ligado: true, conversa: x, modo: x.modoIA ?? state?.automations?.modoIA ?? defaultAutomations.modoIA }, agora)) return x;
      reservado = true;
      return { ...x, agenteAna: { ...x.agenteAna, followupVendedor: { ofertaEm: decisao.ofertaEm }, envioAna: { mensagemId: `vendedor:${decisao.ofertaEm}`, texto, desde: agora.toISOString() } } };
    });
    if (!reservado) continue;
    try {
      const sent = await enviarMensagemSistema({ supabase: db, conversaId: row.id, texto, motivo: 'vendedor', contatoEsperado: contato, horarios: slots });
      if (sent.simulado) throw new Error('Canal desligado.');
      await atualizarConversa(db, row.id, x => ({
        ...x,
        agenteAna: { ...x.agenteAna, followupVendedor: { ofertaEm: decisao.ofertaEm, enviadoEm: agora.toISOString() }, horariosTeste: slots, agendaReal: true, horariosApresentados: [...new Set([...(x.agenteAna?.horariosApresentados ?? []), ...slots])], listasHorarios: (x.agenteAna?.listasHorarios ?? 0) + 1 },
        mensagens: [...x.mensagens, newMessage(texto, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada' })],
        timeline: [...x.timeline, { data: agora.toISOString(), evento: 'Follow-up do atendente vendedor enviado (consulta on-line e gratuita, horários atualizados)' }],
      }));
      res.enviados++;
    } catch (error) {
      res.falhas++;
      console.error('Follow-up do vendedor não enviado', error);
      await db.rpc('registrar_audit_log', { p_ator: 'Ana', p_perfil: 'sistema', p_acao: 'followupVendedor', p_resumo: 'Follow-up não confirmado; não será reenviado', p_status: 'erro', p_erro: 'Envio não confirmado.' });
    }
  }
  return res;
}
