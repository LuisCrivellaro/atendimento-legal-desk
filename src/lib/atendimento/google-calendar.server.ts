const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';

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
