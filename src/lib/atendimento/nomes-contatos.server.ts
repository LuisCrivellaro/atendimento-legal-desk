import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { fotoContatoValida, chaveNomeContato, indexarNomesContatos, mesclarNomesAgenda, type AgendaWhatsApp, type ContatoUltraNome } from './nomes-contatos';
type Db = SupabaseClient<Database>;
type Workspace = Record<string, unknown> & { agendaWhatsApp?: AgendaWhatsApp };

export async function lerAgendaWhatsApp(db: Db, owner: string) {
  const r = await db.from('office_workspace').select('dados').eq('owner_id', owner).maybeSingle();
  if (r.error) throw new Error('Nomes dos contatos indisponíveis.');
  return (r.data?.dados as unknown as Workspace | undefined)?.agendaWhatsApp;
}
export async function sincronizarNomesWhatsApp(db: Db, owner: string, automatico = false) {
  const anterior = await lerAgendaWhatsApp(db, owner);
  if (automatico && anterior && Date.now() - Date.parse(anterior.sincronizadoEm) < 15 * 60000) return { atualizados: 0, agenda: anterior, reutilizada: true };
  const instance = process.env['ULTRAMSG_INSTANCE_ID']?.trim();
  const token = process.env['ULTRAMSG_TOKEN']?.trim();
  if (!instance || !token) throw new Error('WhatsApp não configurado.');
  const r = await fetch(`https://api.ultramsg.com/${encodeURIComponent(instance)}/contacts?${new URLSearchParams({ token })}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`UltraMsg não devolveu a agenda (HTTP ${r.status}).`);
  const lista: unknown = await r.json();
  if (!Array.isArray(lista) || lista.some(c => !c || typeof c !== 'object')) throw new Error('UltraMsg devolveu uma agenda em formato não confirmado.');
  const { contatos, ambiguos } = indexarNomesContatos(lista as ContatoUltraNome[]);
  const casos = await db.from('casos').select('id,dados').eq('owner_id', owner);
  if (casos.error) throw new Error('Não foi possível conferir as conversas.');
  // Persist only contacts already present in this owner's conversations; no new client/case is created.
  const chaves = new Set((casos.data ?? []).map(c => chaveNomeContato(String((c.dados as Record<string, Json>)?.['telefone'] ?? ''))).filter(Boolean));
  const vinculados = Object.fromEntries(Object.entries(contatos).filter(([k]) => chaves.has(k)));
  const em = new Date().toISOString();
  // Photos refresh at most daily per contact; the UltraMsg lookup is keyed by the exact chat id.
  const pendentes = Object.entries(vinculados).filter(([k]) => { const a = anterior?.contatos[k]; return !a?.fotoEm || Date.now() - Date.parse(a.fotoEm) > 864e5; });
  const comId = pendentes.filter(([, c]) => c.chatId?.endsWith('@c.us'));
  for (let i = 0; i < comId.length; i += 8) await Promise.all(comId.slice(i, i + 8).map(async ([k, c]) => {
    try {
      const f = await fetch(`https://api.ultramsg.com/${encodeURIComponent(instance)}/contacts/image?${new URLSearchParams({ token, chatId: c.chatId ?? '' })}`, { signal: AbortSignal.timeout(8000) });
      if (!f.ok) return;
      vinculados[k] = { ...c, foto: fotoContatoValida(await f.json()), fotoEm: em };
    } catch { /* keep previous photo; retry next sync */ }
  }));
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const row = await db.from('office_workspace').select('dados,updated_at').eq('owner_id', owner).maybeSingle();
    if (row.error) throw new Error('Agenda local indisponível.');
    const atual = (row.data?.dados ?? {}) as unknown as Workspace;
    const agenda = mesclarNomesAgenda(atual.agendaWhatsApp, vinculados, em, [...ambiguos].filter(k => chaves.has(k)).length);
    const dados = { ...atual, agendaWhatsApp: agenda } as unknown as Json;
    const salvo = row.data ? await db.from('office_workspace').update({ dados, updated_at: em }).eq('owner_id', owner).eq('updated_at', row.data.updated_at).select('owner_id') : await db.from('office_workspace').insert({ owner_id: owner, dados }).select('owner_id');
    if (salvo.error) throw new Error('Não foi possível salvar os nomes dos contatos.');
    if (salvo.data?.length) return { atualizados: Object.values(vinculados).filter(c => c.agenda).length, agenda, reutilizada: false };
  }
  throw new Error('A agenda mudou simultaneamente; tente atualizar novamente.');
}