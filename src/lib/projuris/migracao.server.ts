import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { projuris } from './cliente.server';
import { compromissosDaResposta, RESPONSAVEL_PADRAO } from './agenda';
import { inventariarEventos, reciboCompromisso, type EventoGoogle } from './migracao';
import { reservarCompromisso } from './agenda.server';

const URL = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';
async function google(path: string) {
  const lovable = process.env['LOVABLE_API_KEY']; const key = process.env['GOOGLE_CALENDAR_API_KEY'];
  if (!lovable || !key) throw new Error('Google Calendar não configurado.');
  const response = await fetch(`${URL}${path}`, { headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': key } });
  if (!response.ok) { console.error('Inventário Google', response.status, await response.text()); throw new Error(`Consulta Google indisponível (${response.status}).`); }
  return response.json();
}
export async function lerInventario() {
  const inicio = new Date().toISOString(); const eventos: EventoGoogle[] = []; let token: string | undefined;
  const vistos = new Set<string>();
  do {
    const q = new URLSearchParams({ timeMin: inicio, singleEvents: 'true', showDeleted: 'true', maxResults: '2500', ...(token ? { pageToken: token } : {}) });
    const pagina = await google(`/calendars/primary/events?${q}`) as { items?: EventoGoogle[]; nextPageToken?: string };
    if (!Array.isArray(pagina.items)) throw new Error('Inventário incompleto; nenhuma migração autorizada.');
    eventos.push(...pagina.items); token = pagina.nextPageToken;
    if (token && vistos.has(token)) throw new Error('Paginação incompleta; nenhuma migração autorizada.');
    if (token) vistos.add(token);
  } while (token);
  const raw = await projuris.chamar('tarefa.compromissoConsulta', { corpo: { flagCompromisso: true } });
  const agenda = compromissosDaResposta(raw);
  const itens = inventariarEventos(eventos, agenda);
  return { em: new Date().toISOString(), total: eventos.length, itens };
}

type Db = SupabaseClient<Database>;
export async function guardarMigracao(db: Db, owner: string, registro: Record<string, unknown>) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const row = await db.from('office_workspace').select('dados,updated_at').eq('owner_id', owner).single();
    if (row.error) throw new Error('Não foi possível registrar a migração.');
    const dados = row.data.dados as Record<string, Json>;
    const anteriores = Array.isArray(dados['migracaoAgenda']) ? dados['migracaoAgenda'] : [];
    const next = JSON.parse(JSON.stringify({ ...dados, migracaoAgenda: [...anteriores, { ...registro, em: new Date().toISOString(), por: owner }] })) as Json;
    const write = await db.from('office_workspace').update({ dados: next, updated_at: new Date().toISOString() }).eq('owner_id', owner).eq('updated_at', row.data.updated_at).select('owner_id');
    if (write.error) throw new Error('Não foi possível registrar a migração.');
    if (write.data.length) return;
  }
  throw new Error('Conferência alterada simultaneamente. Atualize.');
}

export async function migrarEvento(db: Db, owner: string, id: string, etag: string) {
  const inventario = await lerInventario();
  const item = inventario.itens.find(i => i.evento.id === id);
  if (!item || item.evento.etag !== etag || item.estado !== 'pronto') throw new Error('Evento alterado ou pendente; atualize a conferência.');
  const evento = await google(`/calendars/primary/events/${encodeURIComponent(id)}`) as EventoGoogle;
  if (evento.etag !== etag || evento.status !== 'confirmed' || item.inicio <= Date.now()) throw new Error('Evento mudou ou não é futuro. Original mantido.');
  // Persistir a intenção ANTES do efeito externo; tentativas ambíguas ficam bloqueadas para conferência humana.
  const row = await db.from('office_workspace').select('dados').eq('owner_id', owner).single();
  if (row.error) throw new Error('Histórico indisponível.');
  const registros = (row.data.dados as Record<string, Json>)['migracaoAgenda'];
  if (Array.isArray(registros) && registros.some(r => r && typeof r === 'object' && !Array.isArray(r) && r['origem'] === item.origem)) throw new Error('Evento já possui tentativa registrada. Conferência humana necessária; não repetir.');
  await guardarMigracao(db, owner, { origem: item.origem, etapa: 'intencao', evento });
  const pedido = { titulo: evento.summary ?? '', inicioMs: item.inicio, fimMs: item.fim, codigoExterno: item.origem, descricao: `${evento.description ?? ''}\nCliente: ${item.cliente}\nOrigem Google Calendar: ${id}\nManager ADV: ${evento.extendedProperties?.private?.conversa ?? 'consulta manual'}${evento.hangoutLink ? `\nReunião: ${evento.hangoutLink}` : ''}` };
  const resultado = await reservarCompromisso(db, owner, pedido);
  let verificado = false;
  if (resultado.ok) {
    const raw = await projuris.chamar('tarefa.compromissoObter', { parametros: { codigo: resultado.codigo } });
    verificado = reciboCompromisso(raw, pedido, RESPONSAVEL_PADRAO.chave);
  }
  const original = await google(`/calendars/primary/events/${encodeURIComponent(id)}`) as EventoGoogle;
  verificado = verificado && original.etag === etag;
  await guardarMigracao(db, owner, { origem: item.origem, etapa: verificado ? 'verificado' : 'pendente', resultado });
  return { verificado, resultado };
}