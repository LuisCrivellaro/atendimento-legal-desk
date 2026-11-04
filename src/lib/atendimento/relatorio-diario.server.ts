import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { diaAnterior, itemRelatorio, textoRelatorio, WHATSAPP_RELATORIO_DRA, type ItemRelatorio } from './relatorio-diario';
import { enviarTextoUltramsg } from './canais/ultramsg';

/** Envia uma única vez por dia o resumo do dia anterior ao WhatsApp da Dra. Carolina. */
export async function enviarRelatorioDiario(db: SupabaseClient<Database>, agora = new Date()) {
  const dia = diaAnterior(agora);
  const id = `relatorio-diario:${dia}`;
  const desde = new Date(Date.parse(`${dia}T03:00:00Z`)).toISOString();
  const rows = await db.from('casos').select('dados').gte('last_message_at', desde);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  const itens = (rows.data ?? []).map(r => itemRelatorio(r.dados as unknown as Conversa, dia)).filter((x): x is ItemRelatorio => !!x);
  // Reserva antes do envio: nunca reenvia o mesmo dia, mesmo após falha ambígua.
  const reserva = await db.from('ana_monitoramento').insert({ id, estado: { reservadoEm: agora.toISOString(), clientes: itens.length } as never, verificado_em: agora.toISOString() });
  if (reserva.error) return { enviado: false, motivo: 'relatório do dia já reservado' };
  const r = await enviarTextoUltramsg(WHATSAPP_RELATORIO_DRA, textoRelatorio(itens, dia), { instancia: process.env['ULTRAMSG_INSTANCE_ID']?.trim() ?? '', token: process.env['ULTRAMSG_TOKEN']?.trim() ?? '' }, true);
  await db.from('ana_monitoramento').update({ estado: { enviadoEm: agora.toISOString(), clientes: itens.length, ok: r.ok } as never }).eq('id', id);
  await db.rpc('registrar_audit_log', { p_ator: 'Ana', p_perfil: 'sistema', p_acao: 'relatorioDiario', p_resumo: `Relatório de ${dia}: ${itens.length} cliente(s)`, p_status: r.ok ? 'sucesso' : 'erro', ...(r.ok ? {} : { p_erro: 'Envio do relatório não confirmado.' }) });
  return { enviado: r.ok, clientes: itens.length };
}
