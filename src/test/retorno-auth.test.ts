import { describe, it, expect, vi } from 'vitest';
import type { Conversa } from '@/lib/mock-data';
import { conversas } from '@/lib/mock-data';
import { registrarRetorno } from '@/lib/atendimento/ana-contexto';
const mocks=vi.hoisted(()=>({update:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(fn:unknown)=>fn};return b;}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/lib/atendimento/ana.server',()=>({atualizarConversa:mocks.update}));
import { atualizarTarefaRetorno } from '@/lib/atendimento/retorno.functions';
const handler=atualizarTarefaRetorno as unknown as (args:unknown)=>Promise<unknown>;
function contexto(denied=false){const eq=vi.fn();const q={select:()=>q,eq:(...args:unknown[])=>{eq(...args);return q;},single:async()=>({error:denied?{}:null,data:denied?null:{owner_id:'owner'}})};return {eq,context:{userId:'owner',supabase:{from:()=>q}}};}
describe('Retornos autenticados',()=>{
 it('recusa outro proprietário antes de modificar tarefas',async()=>{mocks.update.mockClear();const c=contexto(true);await expect(handler({context:c.context,data:{conversaId:'case',tarefaId:'t'}})).rejects.toThrow('indisponível');expect(c.eq).toHaveBeenCalledWith('owner_id','owner');expect(mocks.update).not.toHaveBeenCalled();});
 it('só conclui tarefa com resposta humana enviada após sua criação',async()=>{const fixture=conversas[0];if(!fixture)throw new Error('Fixture');let saved=registrarRetorno({...fixture,mensagens:[{id:'cobra',de:'cliente',texto:'Você ficou de me dar um retorno.',hora:'',canal:'ultramsg'}],timeline:[]},'ultramsg','cobra','owner',new Date('2026-11-04T14:00:00Z'));const tarefa=saved.tarefasRetorno?.[0];if(!tarefa)throw new Error('Tarefa');mocks.update.mockImplementation(async(_db:unknown,_id:string,fn:(c:Conversa)=>Conversa)=>{saved=fn(saved);});const ctx=contexto();saved.mensagens.push({id:'demo',de:'escritorio',texto:'Falso',hora:'',status:'simulada',dataHora:'2026-11-04T14:01:00Z'});await expect(handler({context:ctx.context,data:{conversaId:fixture.id,tarefaId:tarefa.id,respostaId:'demo'}})).rejects.toThrow('resposta real');expect(saved.tarefasRetorno?.[0]?.status).toBe('pendente');saved.mensagens.push({id:'real',de:'escritorio',texto:'Recebemos seus documentos para conferência.',hora:'',status:'enviada',dataHora:'2026-11-04T14:02:00Z'});await handler({context:ctx.context,data:{conversaId:fixture.id,tarefaId:tarefa.id,respostaId:'real'}});expect(saved.tarefasRetorno?.[0]).toMatchObject({status:'atendida',respostaId:'real'});});
});