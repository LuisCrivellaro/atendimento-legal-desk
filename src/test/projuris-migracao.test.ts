import { describe, it, expect } from 'vitest';
import { inventariarEventos, origemEvento, reciboCompromisso, type EventoGoogle } from '@/lib/projuris/migracao';
import { buscarPorCodigoExterno } from '@/lib/projuris/agenda.server';
const evento: EventoGoogle = { id: 'abc', status: 'confirmed', summary: 'Consulta CS Lawyers · Maria', description: 'Nome: Maria', organizer: { self: true }, start: { dateTime: '2026-11-05T11:30:00-03:00' }, end: { dateTime: '2026-11-05T11:45:00-03:00' } };
describe('migração segura da agenda', () => {
  it('preserva horário e duração original de 15 minutos sem normalizar para 30', () => {
    const item = inventariarEventos([evento], [])[0];
    expect(item?.inicio).toBe(Date.parse('2026-11-05T14:30:00Z'));
    expect((item?.fim ?? 0) - (item?.inicio ?? 0)).toBe(900000);
    expect(evento.start?.dateTime).toBe('2026-11-05T11:30:00-03:00');
  });
  it('cancelados nunca ficam prontos', () => expect(inventariarEventos([{ ...evento, status: 'cancelled' }], [])[0]?.estado).toBe('cancelado'));
  it('sem cliente mantém pendência sem inventar nome', () => expect(inventariarEventos([{ ...evento, summary: 'Consulta CS Lawyers', description: '' }], [])[0]?.estado).toBe('pendente'));
  it('dia inteiro não é convertido para horário fictício', () => expect(inventariarEventos([{ ...evento, start: { date: '2026-11-05' } }], [])[0]?.estado).toBe('pendente'));
  it('conflito identifica os dois eventos sem escolher prevalência', () => {
    const item = inventariarEventos([evento], [{ codigo: 7, titulo: 'Audiência', inicioMs: Date.parse('2026-11-05T14:00Z'), fimMs: Date.parse('2026-11-05T15:00Z'), concluido: false }])[0];
    expect(item?.estado).toBe('conflito'); expect(item?.conflitos).toEqual([{ codigo: 7, titulo: 'Audiência' }]); expect(item?.evento.id).toBe('abc');
  });
  it('identificador de origem estável impede reimportação', () => {
    expect(origemEvento('abc')).toBe('manageradv:google:primary:abc');
    expect(inventariarEventos([evento], [{ codigo: 7, titulo: evento.summary ?? '', inicioMs: Date.parse(evento.start?.dateTime ?? ''), fimMs: Date.parse(evento.end?.dateTime ?? ''), concluido: false, codigoExterno: origemEvento('abc') }])[0]?.estado).toBe('existente');
  });
  it('duplicatas Google ficam para equipe', () => expect(inventariarEventos([evento, { ...evento, id: 'def' }], [])[0]?.estado).toBe('conflito'));
  it('não considera primeiro resultado como origem quando API ignora filtro', async () => {
    expect(await buscarPorCodigoExterno('manageradv:google:abc', { chamar: async () => ({ tarefasAgrupadasDataTipoWs: [{ tarefaConsultaWs: [{ codigoTarefaEvento: 1, dataInicioCompromisso: 1000, codigoExterno: 'outra-origem' }] }] }) })).toBeUndefined();
  });
  it('confirma somente horário, origem, título e responsável preservados', () => {
    const pedido = { codigoExterno: origemEvento('abc'), titulo: 'Maria', inicioMs: 1000, fimMs: 2000 };
    const raw = { codigoExterno: pedido.codigoExterno, tarefaCompromissoEventoWs: { titulo: 'Maria', dataHoraInicio: 1000, dataHoraFim: 2000, usuariosResponsaveis: [{ chave: 176189 }] } };
    expect(reciboCompromisso(raw, pedido, 176189)).toBe(true);
    expect(reciboCompromisso(raw, { ...pedido, fimMs: 3000 }, 176189)).toBe(false);
    expect(reciboCompromisso(raw, pedido, 99)).toBe(false);
  });
});