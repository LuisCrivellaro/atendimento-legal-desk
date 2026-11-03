import type { Mensagem } from '../mock-data';
import { numeroWhatsApp } from './canais/ultramsg';

/** Resolve only a sent message in the conversation-owned chat. Never pass API queue IDs as WhatsApp IDs. */
export async function apagarNoWhatsApp(m:Mensagem,contato:string,cred:{instancia:string;token:string}):Promise<void> {
 if(!cred.instancia||!cred.token)throw new Error('WhatsApp não configurado.');
 const base=`https://api.ultramsg.com/${encodeURIComponent(cred.instancia)}`;
 const r=await fetch(`${base}/chats/messages?${new URLSearchParams({token:cred.token,chatId:`${numeroWhatsApp(contato)}@c.us`,limit:'100'})}`,{signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error(`Não foi possível conferir a mensagem no WhatsApp (HTTP ${r.status}).`);
 const rows:unknown=await r.json();
 if(!Array.isArray(rows))throw new Error('WhatsApp não devolveu mensagens verificáveis.');
 const mensagens=rows as {id?:string;body?:string;fromMe?:boolean;timestamp?:number|string}[];
 const exata=mensagens.find(x=>x.fromMe===true&&x.id===m.idExterno);
 const stamp=Date.parse(m.dataHora??'');
 const candidatas=mensagens.filter(x=>x.fromMe===true&&x.body===m.texto&&Number.isFinite(stamp)&&Math.abs(Number(x.timestamp)*1000-stamp)<=60000);
 const found=exata??(candidatas.length===1?candidatas[0]:undefined);
 if(!found?.id||found.body!==m.texto)throw new Error('Não foi possível identificar com segurança esta mensagem no WhatsApp. Nada foi apagado.');
 const response=await fetch(`${base}/messages/delete`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:cred.token,msgId:found.id}),signal:AbortSignal.timeout(15000)});
 const body:unknown=await response.json().catch(()=>null);
 const ack=body as {deleted?:boolean|string;success?:boolean|string}|null;
 if(!response.ok||!(ack?.deleted===true||ack?.deleted==='true'||ack?.success===true||ack?.success==='true'))throw new Error(`O WhatsApp não confirmou a exclusão (HTTP ${response.status}). A mensagem permanece registrada.`);
}