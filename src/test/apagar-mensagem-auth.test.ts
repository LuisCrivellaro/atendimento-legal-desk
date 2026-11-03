import {describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({apagar:vi.fn(),atualizar:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(fn:unknown)=>fn};return b;}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/lib/atendimento/apagar-mensagem.server',()=>({apagarNoWhatsApp:mocks.apagar}));
vi.mock('@/lib/atendimento/ana.server',()=>({atualizarConversa:mocks.atualizar}));
import {apagarMensagemAgente} from '@/lib/atendimento/apagar-mensagem.functions';
const handler=apagarMensagemAgente as unknown as (arg:unknown)=>Promise<unknown>;
describe('permissões de exclusão',()=>{
 it('outro proprietário é recusado antes de qualquer exclusão',async()=>{
  const eq=vi.fn();const q={select:()=>q,eq:(...args:unknown[])=>{eq(...args);return q;},single:async()=>({error:{message:'denied'},data:null})};
  await expect(handler({data:{conversaId:'case',mensagemId:'m',paraTodos:true},context:{userId:'owner',supabase:{from:()=>q}}})).rejects.toThrow('indisponível');
  expect(eq).toHaveBeenCalledWith('owner_id','owner');expect(mocks.apagar).not.toHaveBeenCalled();
 });
 it('atendente não apaga para todos',async()=>{
  const db={from:(table:string)=>{const result=table==='casos'?{data:{dados:{mensagens:[{id:'m',de:'escritorio',autor:'Ana',texto:'x',canal:'ultramsg',idExterno:'77',status:'enviada'}]}},error:null}:{data:[{role:'atendente'}],error:null};const q={select:()=>q,eq:()=>q,single:async()=>result,then:(resolve:(x:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};return q;}};
  await expect(handler({data:{conversaId:'case',mensagemId:'m',paraTodos:true},context:{userId:'owner',supabase:db}})).rejects.toThrow('sênior');expect(mocks.apagar).not.toHaveBeenCalled();
 });
});