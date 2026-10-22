import { idReservaCalendar, intervaloLivre, type ReservaCalendar } from './calendar-booking';
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';

async function calendarRequest(path: string, init: RequestInit = {}) {
  const lovable = process.env['LOVABLE_API_KEY'];
  const key = process.env['GOOGLE_CALENDAR_API_KEY'];
  if (!lovable || !key) throw new Error('Google Calendar não configurado. Nenhuma reserva confirmada.');
  return fetch(`${GATEWAY_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' } });
}

async function erroCalendar(res: Response): Promise<never> {
  const body = await res.text();
  console.error(`Google Calendar [${res.status}]: ${body}`);
  throw new Error(`Google Calendar [${res.status}]: ${body}`);
}

type CalendarEvent = { id?: string; status?: string; htmlLink?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; extendedProperties?: { private?: { conversa?: string } } };
function validarReserva(event: CalendarEvent, conversaId: string, inicio: string, fim: string): ReservaCalendar {
  if (event.status === 'cancelled' || !event.id || event.extendedProperties?.private?.conversa !== conversaId || Date.parse(event.start?.dateTime ?? '') !== Date.parse(inicio) || Date.parse(event.end?.dateTime ?? '') !== Date.parse(fim)) throw new Error('Horário indisponível ou já reservado por outro atendimento.');
  return { id: event.id, inicio, fim, ...(event.htmlLink ? { url: event.htmlLink } : {}) };
}

/** Só chamado após validar webhook, contato, modo Automática e escolha inequívoca. Sem CPF, assunto jurídico ou convites. */
export async function reservarGoogleCalendar(conversaId: string, inicio: string, now = new Date()): Promise<ReservaCalendar> {
  if (!conversaId || !Number.isFinite(Date.parse(inicio)) || Date.parse(inicio) <= now.getTime()) throw new Error('Escolha um horário futuro disponível.');
  inicio = new Date(inicio).toISOString();
  const fim = new Date(Date.parse(inicio) + 60 * 60000).toISOString();
  const id = await idReservaCalendar(inicio);
  const existing = await calendarRequest(`/calendars/primary/events/${id}`);
  if (existing.ok) return validarReserva(await existing.json(), conversaId, inicio, fim);
  if (existing.status !== 404) return erroCalendar(existing);
  const check = await calendarRequest('/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: inicio, timeMax: fim, timeZone: 'America/Sao_Paulo', items: [{ id: 'primary' }] }) });
  if (!check.ok) return erroCalendar(check);
  const availability = await check.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
  const calendar = availability.calendars?.['primary'];
  if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error('Não foi possível verificar disponibilidade; nenhuma reserva confirmada.');
  if (!intervaloLivre(calendar.busy, inicio, fim)) throw new Error('Esse horário acabou de ficar ocupado. Escolha outro horário.');
  const created = await calendarRequest('/calendars/primary/events?sendUpdates=none', { method: 'POST', body: JSON.stringify({ id, summary: 'Consulta CS Lawyers · Ana', start: { dateTime: inicio, timeZone: 'America/Sao_Paulo' }, end: { dateTime: fim, timeZone: 'America/Sao_Paulo' }, extendedProperties: { private: { conversa: conversaId } } }) });
  if (created.status === 409) {
    const concurrent = await calendarRequest(`/calendars/primary/events/${id}`);
    if (!concurrent.ok) return erroCalendar(concurrent);
    return validarReserva(await concurrent.json(), conversaId, inicio, fim);
  }
  if (!created.ok) return erroCalendar(created);
  return validarReserva(await created.json(), conversaId, inicio, fim);
}

/** Períodos ocupados da agenda principal (somente leitura). Retorna null se indisponível. */
export async function ocupadosGoogleCalendar(now = new Date(), dias = 14): Promise<{ start: string; end: string }[] | null> {
  const lovable = process.env['LOVABLE_API_KEY'];
  const key = process.env['GOOGLE_CALENDAR_API_KEY'];
  if (!lovable || !key) return null;
  try {
    const res = await fetch(`${GATEWAY_URL}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: now.toISOString(), timeMax: new Date(now.getTime() + dias * 86400000).toISOString(), timeZone: 'America/Sao_Paulo', items: [{ id: 'primary' }] }),
    });
    if (!res.ok) { console.error(`Google Calendar freeBusy [${res.status}]: ${await res.text()}`); return null; }
    const body = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
    const cal = body.calendars?.['primary'] ?? Object.values(body.calendars ?? {})[0];
    if (!cal || cal.errors?.length) return null;
    return cal.busy ?? [];
  } catch (e) { console.error('Google Calendar indisponível', e); return null; }
}
