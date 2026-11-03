import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { podeExecutarAna } from './ana-execution';
import { processarAna } from './ana.server';

export async function recuperarAna(db: SupabaseClient<Database>, request: Request) {
  const contatos=await db.from('atendimento_contatos_teste').select('conversa_id').eq('canal','ultramsg').eq('status','liberado');
  if(contatos.error)throw new Error('Contatos indisponíveis.');
  const ids=[...new Set((contatos.data??[]).map(c=>c.conversa_id).filter((id):id is string=>!!id))];
  if(!ids.length)return {processados:0};
  const rows=await db.from('casos').select('id,dados').in('id',ids);
  if(rows.error)throw new Error('Conversas indisponíveis.');
  const candidatos=rows.data.map(row=>({id:row.id,c:row.dados as unknown as Conversa})).filter(({c})=>{
    const m=c.mensagens.at(-1);
    return !c.agenteAna?.humano&&!c.agenteAna?.pausa&&m?.de==='cliente'&&m.canal==='ultramsg'&&!!m.iaExecucao&&podeExecutarAna(m);
  }).sort((a,b)=>String(a.c.mensagens.at(-1)?.iaExecucao?.desde).localeCompare(String(b.c.mensagens.at(-1)?.iaExecucao?.desde))).slice(0,2);
  await Promise.all(candidatos.map(async ({id,c})=>{const m=c.mensagens.at(-1);if(m)await processarAna(db,id,m.id,request);}));
  return {processados:candidatos.length};
}