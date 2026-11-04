import { sobrepoe, type CompromissoPJ } from './agenda';

export interface EventoGoogle {
  id?: string; etag?: string; status?: string; summary?: string; description?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  organizer?: { self?: boolean; email?: string };
  extendedProperties?: { private?: { conversa?: string } };
  hangoutLink?: string;
}
export interface ItemMigracao {
  evento: EventoGoogle; origem: string; cliente: string; inicio: number; fim: number;
  estado: 'pronto' | 'cancelado' | 'pendente' | 'conflito' | 'existente';
  motivo: string; conflitos: { codigo: number; titulo: string }[];
}
export function origemEvento(id: string) { return `manageradv:google:primary:${id}`; }
export function inventariarEventos(eventos: EventoGoogle[], agenda: CompromissoPJ[]): ItemMigracao[] {
  return eventos.map(evento => {
    const inicio = Date.parse(evento.start?.dateTime ?? '');
    const fim = Date.parse(evento.end?.dateTime ?? '');
    const origem = origemEvento(evento.id ?? '');
    const titulo = evento.summary?.trim() ?? '';
    const cliente = evento.description?.match(/^Nome:\s*(.+)$/mi)?.[1]?.trim()
      ?? titulo.match(/^Consulta CS Lawyers\s*[·,–-]\s*(.+)$/i)?.[1]?.trim() ?? '';
    const base = { evento, origem, cliente, inicio: Number.isFinite(inicio) ? inicio : 0, fim: Number.isFinite(fim) ? fim : 0, conflitos: [] as ItemMigracao['conflitos'] };
    if (evento.status === 'cancelled') return { ...base, estado: 'cancelado' as const, motivo: 'Cancelado no Google; não migrar.' };
    if (evento.status !== 'confirmed' || !evento.id || !cliente || !evento.organizer?.self || !Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio)
      return { ...base, estado: 'pendente' as const, motivo: 'Conferir cliente, responsável, situação ou horário; original mantido.' };
    const equivalente = agenda.find(c => c.codigoExterno === origem || (c.inicioMs === inicio && c.fimMs === fim && c.titulo.trim().toLocaleLowerCase() === titulo.toLocaleLowerCase()));
    if (equivalente) return { ...base, estado: 'existente' as const, motivo: 'Equivalência encontrada; conferir registro existente.', conflitos: [{ codigo: equivalente.codigo, titulo: equivalente.titulo }] };
    const conflitos = agenda.filter(c => !c.concluido && sobrepoe(inicio, fim, c.inicioMs, c.fimMs)).map(c => ({ codigo: c.codigo, titulo: c.titulo }));
    const duplicado = eventos.some(e => e.id !== evento.id && e.status === 'confirmed' && Date.parse(e.start?.dateTime ?? '') === inicio && Date.parse(e.end?.dateTime ?? '') === fim && e.summary?.trim().toLocaleLowerCase() === titulo.toLocaleLowerCase());
    if (conflitos.length || duplicado) return { ...base, conflitos, estado: 'conflito' as const, motivo: duplicado ? 'Possível duplicidade no Google.' : 'Horário ocupado no ProJuris; decisão da equipe.' };
    return { ...base, estado: 'pronto' as const, motivo: 'Aguardando conferência e autorização individual.' };
  });
}

/** Verifica o DTO completo de leitura, não apenas a presença de uma resposta. */
export function reciboCompromisso(raw: unknown, pedido: { codigoExterno: string; inicioMs: number; fimMs: number; titulo: string }, responsavel: number): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  const e = r['tarefaCompromissoEventoWs'] as Record<string, unknown> | undefined;
  return r['codigoExterno'] === pedido.codigoExterno && !!e && e['dataHoraInicio'] === pedido.inicioMs && e['dataHoraFim'] === pedido.fimMs && e['titulo'] === pedido.titulo && Array.isArray(e['usuariosResponsaveis']) && e['usuariosResponsaveis'].some(u => u && typeof u === 'object' && u['chave'] === responsavel);
}