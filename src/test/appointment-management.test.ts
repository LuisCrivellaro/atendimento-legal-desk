import {describe,it,expect,vi,afterEach} from 'vitest';
import {decidirAlteracaoConsulta} from '@/lib/atendimento/appointment-management';
import {cancelarGoogleCalendar,remarcarGoogleCalendar,ocupadosGoogleCalendar} from '@/lib/atendimento/google-calendar.server';
const inicio='2026-10-26T12:00:00.000Z',fim='2026-10-26T12:30:00.000Z';
const novaInicio='2026-10-27T12:00:00.000Z',novaFim='2026-10-27T12:30:00.000Z';
const reserva={id:'anavelho',inicio,fim};
const original={...reserva,start:{dateTime:inicio},end:{dateTime:fim},extendedProperties:{private:{conversa:'caso-1'}}};
const novo={id:'ananovo',start:{dateTime:novaInicio},end:{dateTime:novaFim},extendedProperties:{private:{conversa:'caso-1'}}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function setup(){vi.stubEnv('LOVABLE_API_KEY','test');vi.stubEnv('GOOGLE_CALENDAR_API_KEY','test');const f=vi.fn();vi.stubGlobal('fetch',f);return f;}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('alteração autorizada da consulta',()=>{
 it('novo pedido com consulta existente pergunta antes de alterar',()=>expect(decidirAlteracaoConsulta('Quero agendar uma consulta',true)).toBe('perguntar'));
 it('cancelamento explícito autoriza cancelar',()=>expect(decidirAlteracaoConsulta('Quero cancelar minha consulta',true)).toBe('cancelar'));
 it('remarcação explícita autoriza remarcar',()=>expect(decidirAlteracaoConsulta('Quero remarcar minha consulta',true)).toBe('remarcar'));
 it.each(['Não quero cancelar','Talvez cancelar','Como posso cancelar?','Cancelar ou remarcar','sim'])('não executa cancelamento ambíguo: %s',texto=>expect(decidirAlteracaoConsulta(texto,true)).not.toBe('cancelar'));
 it('cancelamento sem autorização não chama agenda',async()=>{const f=setup();await expect(cancelarGoogleCalendar('caso-1',reserva,false)).rejects.toThrow('autorização');expect(f).not.toHaveBeenCalled();});
 it('compromisso de outra conversa nunca é cancelado',async()=>{const f=setup().mockResolvedValueOnce(json(original));await expect(cancelarGoogleCalendar('caso-2',reserva,true)).rejects.toThrow('pertence');expect(f).toHaveBeenCalledTimes(1);});
 it('cancela evento verificado apenas após autorização',async()=>{const f=setup().mockResolvedValueOnce(json(original)).mockResolvedValueOnce(new Response(null,{status:204}));await cancelarGoogleCalendar('caso-1',reserva,true);expect(f.mock.calls[1]?.[1].method).toBe('DELETE');});
 it('remarcação sem autorização não chama agenda',async()=>{const f=setup();await expect(remarcarGoogleCalendar('caso-1',reserva,novaInicio,false)).rejects.toThrow('autorização');expect(f).not.toHaveBeenCalled();});
 it('remarca reservando novo horário antes de cancelar o antigo',async()=>{
  const f=setup().mockResolvedValueOnce(json(original)).mockResolvedValueOnce(json({},404)).mockResolvedValueOnce(json({calendars:{primary:{busy:[]}}})).mockResolvedValueOnce(json(novo)).mockResolvedValueOnce(json(original)).mockResolvedValueOnce(new Response(null,{status:204}));
  const result=await remarcarGoogleCalendar('caso-1',reserva,novaInicio,true,new Date('2026-10-23T04:21:00Z'),{nome:'Maria',telefone:'5511999600306',tipo:'novo'});
  expect(result.inicio).toBe(novaInicio);expect(f.mock.calls[3]?.[1].method).toBe('POST');expect(f.mock.calls[5]?.[1].method).toBe('DELETE');expect(f.mock.calls[5]?.[0]).toContain('anavelho');
 });
 it('horário novo ocupado preserva o antigo',async()=>{
  const f=setup().mockResolvedValueOnce(json(original)).mockResolvedValueOnce(json({},404)).mockResolvedValueOnce(json({calendars:{primary:{busy:[{start:novaInicio,end:novaFim}]}}}));
  await expect(remarcarGoogleCalendar('caso-1',reserva,novaInicio,true,new Date('2026-10-23T04:21:00Z'),{nome:'Maria',telefone:'5511999600306',tipo:'novo'})).rejects.toThrow('ocupado');expect(f.mock.calls.some(c=>c[1]?.method==='DELETE')).toBe(false);
 });
 it('falha ao cancelar antigo desfaz novo e preserva o anterior',async()=>{
  const f=setup().mockResolvedValueOnce(json(original)).mockResolvedValueOnce(json({},404)).mockResolvedValueOnce(json({calendars:{primary:{busy:[]}}})).mockResolvedValueOnce(json(novo)).mockResolvedValueOnce(json(original)).mockResolvedValueOnce(json({error:'failure'},500)).mockResolvedValueOnce(json(novo)).mockResolvedValueOnce(new Response(null,{status:204}));
  await expect(remarcarGoogleCalendar('caso-1',reserva,novaInicio,true,new Date('2026-10-23T04:21:00Z'),{nome:'Maria',telefone:'5511999600306',tipo:'novo'})).rejects.toThrow('500');expect(f.mock.calls[7]?.[0]).toContain('ananovo');expect(f.mock.calls[7]?.[1].method).toBe('DELETE');
 });
 it('resposta incompleta da agenda nunca significa disponibilidade livre',async()=>{setup().mockResolvedValueOnce(json({calendars:{primary:{}}}));expect(await ocupadosGoogleCalendar()).toBeNull();});
});