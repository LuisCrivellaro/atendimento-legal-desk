import { describe, it, expect, vi, afterEach } from 'vitest';
import { escolherReservaAna, idReservaCalendar, intervaloLivre } from '@/lib/atendimento/calendar-booking';
import { reservarGoogleCalendar } from '@/lib/atendimento/google-calendar.server';

const inicio='2026-10-26T12:00:00.000Z', fim='2026-10-26T13:00:00.000Z';
const now=new Date('2026-10-22T21:24:00Z');
const input={texto:'26/10 às 9h',horarios:[inicio],real:true,teste:true,modo:'Automática',bloqueado:false,now};
const event={id:'ana123',start:{dateTime:inicio},end:{dateTime:fim},extendedProperties:{private:{conversa:'caso-1'}}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(){vi.stubEnv('LOVABLE_API_KEY','test');vi.stubEnv('GOOGLE_CALENDAR_API_KEY','test');return vi.fn();}
describe('reserva automática autorizada',()=>{
  it('escolha única de horário real é reservável sem confirmação manual',()=>expect(escolherReservaAna(input)).toBe(inicio));
  it('horário fictício nunca gera reserva real',()=>expect(escolherReservaAna({...input,real:false})).toBeUndefined());
  it.each(['Sugerir','Desligada'])('modo %s nunca reserva',modo=>expect(escolherReservaAna({...input,modo})).toBeUndefined());
  it('contato fora do teste autorizado não reserva',()=>expect(escolherReservaAna({...input,teste:false})).toBeUndefined());
  it('bloqueio humano impede reserva',()=>expect(escolherReservaAna({...input,bloqueado:true})).toBeUndefined());
  it('escolha ambígua não reserva',()=>expect(escolherReservaAna({...input,texto:'9h',horarios:[inicio,'2026-10-27T12:00:00Z']})).toBeUndefined());
  it('horário passado não reserva',()=>expect(escolherReservaAna({...input,now:new Date('2026-10-27T00:00:00Z')})).toBeUndefined());
  it('id único é estável para o mesmo instante',async()=>expect(await idReservaCalendar(inicio)).toBe(await idReservaCalendar('2026-10-26T09:00:00-03:00')));
  it('período ocupado bloqueia reserva, limite adjacente não',()=>{expect(intervaloLivre([{start:inicio,end:fim}],inicio,fim)).toBe(false);expect(intervaloLivre([{start:fim,end:'2026-10-26T14:00:00Z'}],inicio,fim)).toBe(true);});
  it('cria evento de 60 minutos e retorna recibo apenas após sucesso',async()=>{
    const mock=setup().mockResolvedValueOnce(json({},404)).mockResolvedValueOnce(json({calendars:{primary:{busy:[]}}})).mockResolvedValueOnce(json(event));vi.stubGlobal('fetch',mock);
    const receipt=await reservarGoogleCalendar('caso-1',inicio,now);
    expect(receipt).toEqual({id:'ana123',inicio,fim});
    const payload=JSON.parse(mock.mock.calls[2]?.[1].body);
    expect(payload.start).toEqual({dateTime:inicio,timeZone:'America/Sao_Paulo'});expect(payload.end.dateTime).toBe(fim);expect(payload.attendees).toBeUndefined();expect(payload.description).toBeUndefined();
  });
  it('evento existente do mesmo atendimento não é duplicado',async()=>{const mock=setup().mockResolvedValueOnce(json(event));vi.stubGlobal('fetch',mock);await reservarGoogleCalendar('caso-1',inicio,now);expect(mock).toHaveBeenCalledTimes(1);});
  it('evento de outro atendimento não pode ser confirmado',async()=>{const mock=setup().mockResolvedValueOnce(json(event));vi.stubGlobal('fetch',mock);await expect(reservarGoogleCalendar('caso-2',inicio,now)).rejects.toThrow('outro atendimento');expect(mock).toHaveBeenCalledTimes(1);});
  it('ocupação revalidada impede criar evento',async()=>{const mock=setup().mockResolvedValueOnce(json({},404)).mockResolvedValueOnce(json({calendars:{primary:{busy:[{start:inicio,end:fim}]}}}));vi.stubGlobal('fetch',mock);await expect(reservarGoogleCalendar('caso-1',inicio,now)).rejects.toThrow('ocupado');expect(mock).toHaveBeenCalledTimes(2);});
  it('erro de permissão preserva status e não confirma reserva',async()=>{const mock=setup().mockResolvedValueOnce(json({error:{message:'insufficient scope'}},403));vi.stubGlobal('fetch',mock);await expect(reservarGoogleCalendar('caso-1',inicio,now)).rejects.toThrow('403');expect(mock).toHaveBeenCalledTimes(1);});
  it('conflito simultâneo recupera apenas recibo do mesmo atendimento',async()=>{const mock=setup().mockResolvedValueOnce(json({},404)).mockResolvedValueOnce(json({calendars:{primary:{busy:[]}}})).mockResolvedValueOnce(json({},409)).mockResolvedValueOnce(json(event));vi.stubGlobal('fetch',mock);expect((await reservarGoogleCalendar('caso-1',inicio,now)).id).toBe('ana123');expect(mock).toHaveBeenCalledTimes(4);});
});