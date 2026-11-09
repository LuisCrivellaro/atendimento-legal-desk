import { describe, it, expect, vi } from 'vitest';
const mock=vi.hoisted(()=>({saved:[] as unknown[],revision:'old',calls:0}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({
 select:()=>({eq:()=>({maybeSingle:async()=>({data:{dados:{anaPausa:{ativa:true,motivo:'Acesso bloqueado'},agendaWhatsApp:{sincronizadoEm:'2026-11-09',ambiguos:0,contatos:{'551199990001':{telefone:'5511999990001',agenda:'Nome salvo'}}}},updated_at:mock.revision},error:null})})}),
 update:(value:unknown)=>{mock.saved.push(value);return {eq:()=>({eq:()=>({select:async()=>({data:++mock.calls===1?[]:[{owner_id:'owner'}],error:null})})})};},
})}}));
import { saveOffice } from '@/lib/office-store';
import { defaultState } from '@/lib/office';
describe('pausa persistente da Ana',()=>{
 it('salvamento antigo preserva pausa do servidor mesmo após conflito',async()=>{
  await saveOffice('owner',defaultState);
  expect(mock.saved).toHaveLength(2);
  expect(mock.saved[1]).toMatchObject({dados:{anaPausa:{ativa:true,motivo:'Acesso bloqueado'}}});
 });
 it('salvamento antigo de treinamento preserva agenda recém-sincronizada',async()=>{
  await saveOffice('owner',defaultState);
  expect(mock.saved.at(-1)).toMatchObject({dados:{agendaWhatsApp:{contatos:{'551199990001':{agenda:'Nome salvo'}}}}});
 });
});