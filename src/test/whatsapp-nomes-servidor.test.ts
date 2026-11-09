import { describe, expect, it, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { sincronizarNomesWhatsApp } from '@/lib/atendimento/nomes-contatos.server';
import { atualizarNomesWhatsApp } from '@/lib/atendimento/nomes-contatos.functions';
import { chaveNomeContato } from '@/lib/atendimento/nomes-contatos';
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,handler:(fn:unknown)=>fn};return b;}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
function banco() {
 let dados:Record<string,unknown>={training:{instrucoes:'Preservar'},casos:{legal:{peticao:'Original'}}};
 let writes=0;const owners:string[]=[];
 const db={from(table:string){let patch:Record<string,unknown>|undefined;
  const result=()=>{if(table==='casos')return {error:null,data:[{id:'c',dados:{telefone:'5511999990001'}}]};if(patch){writes++;dados=patch['dados'] as Record<string,unknown>;return {error:null,data:[{owner_id:'owner'}]};}return {error:null,data:{dados,updated_at:'rev'}};};
  const q={select:()=>q,eq:(field:string,value:string)=>{if(field==='owner_id')owners.push(value);return q;},update:(p:Record<string,unknown>)=>{patch=p;return q;},maybeSingle:async()=>result(),then:(f:(r:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(f)};return q;}} as unknown as SupabaseClient<Database>;
 return {db,get dados(){return dados},get writes(){return writes},owners};
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('sincronização de nomes sem alterar casos',()=>{
 it('grava só números do proprietário, mantém material e não cria conversa',async()=>{
  vi.stubEnv('ULTRAMSG_INSTANCE_ID','test');vi.stubEnv('ULTRAMSG_TOKEN','test');
  const f=vi.fn().mockResolvedValue({ok:true,json:async()=>[{id:'5511999990001@c.us',isMyContact:true,name:'Agenda da Dra.',pushname:'Perfil'},{id:'5521999990001@c.us',isMyContact:true,name:'Outro proprietário'}]});vi.stubGlobal('fetch',f);
  const h=banco();const r=await sincronizarNomesWhatsApp(h.db,'owner');
  expect(r.atualizados).toBe(1);expect(Object.keys(r.agenda.contatos)).toEqual([chaveNomeContato('5511999990001')]);expect(h.dados['casos']).toEqual({legal:{peticao:'Original'}});expect(h.dados['training']).toEqual({instrucoes:'Preservar'});expect(h.writes).toBe(1);expect(h.owners.every(o=>o==='owner')).toBe(true);
  const again=await sincronizarNomesWhatsApp(h.db,'owner',true);expect(again.reutilizada).toBe(true);expect(f).toHaveBeenCalledOnce();
 });
 it('erro do provedor preserva a agenda local',async()=>{
  vi.stubEnv('ULTRAMSG_INSTANCE_ID','test');vi.stubEnv('ULTRAMSG_TOKEN','test');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:503}));const h=banco();await expect(sincronizarNomesWhatsApp(h.db,'owner')).rejects.toThrow('503');expect(h.writes).toBe(0);
 });
 it('perfil atendente não pode sincronizar dados da conta conectada',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);
  const db={from:()=>({select:()=>({eq:async()=>({error:null,data:[{role:'atendente'}]})})})};
  const handler=atualizarNomesWhatsApp as unknown as (v:{context:{supabase:unknown;userId:string}})=>Promise<unknown>;
  await expect(handler({context:{supabase:db,userId:'owner'}})).rejects.toThrow('Somente');expect(f).not.toHaveBeenCalled();
 });
});