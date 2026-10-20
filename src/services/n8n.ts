// All external actions remain simulated until a server integration is explicitly connected.
import { freeSlots } from '@/lib/atendimento';

export type N8nAction =
  | "enviarMensagem" | "enviarHorarios" | "solicitarDocumentos" | "gerarContrato"
  | "gerarCobranca" | "agendarRetorno" | "criarPastaCliente" | "iniciarProducao"
  | "buscarJurisprudencia" | "executarAuditoriaIA" | "autuar" | "vincularProcessoProjuris"
  | "sincronizarEtapaProjuris" | "enviarAvisoAndamento" | "enviarListaProvas" | "obterHorariosLivres" | "agendarConsulta" | "iniciarVideochamada" | "solicitarFaltantes" | "enviarAnexo";

export const endpoints: Record<N8nAction, string> = {
  enviarMensagem: "/webhook/whatsapp/enviar",
  enviarHorarios: "/webhook/whatsapp/horarios",
  solicitarDocumentos: "/webhook/whatsapp/documentos-base",
  gerarContrato: "/webhook/projuris/contrato",
  gerarCobranca: "/webhook/mercadopago/cobranca",
  agendarRetorno: "/webhook/agenda/retorno",
  criarPastaCliente: "/webhook/drive/pasta",
  iniciarProducao: "/webhook/producao/iniciar",
  buscarJurisprudencia: "/webhook/jusbrasil/busca",
  executarAuditoriaIA: "/webhook/auditoria/ia",
  autuar: "/webhook/tribunal/autuar",
  vincularProcessoProjuris: "/webhook/projuris/vincular",
  sincronizarEtapaProjuris: "/webhook/projuris/etapa",
  enviarAvisoAndamento: "/webhook/whatsapp/aviso-andamento",
  enviarListaProvas: "/webhook/whatsapp/lista-provas",
  obterHorariosLivres: '/webhook/agenda/horarios-livres',
  agendarConsulta: '/webhook/agenda/consulta',
  iniciarVideochamada: '/webhook/agenda/videochamada',
  solicitarFaltantes: '/webhook/whatsapp/documentos-faltantes',
  enviarAnexo: '/webhook/whatsapp/anexo',
};

export interface AuditEntry {
  id: string; usuario: string; perfil: string; userId: string; acao: string; payload: string;
  resposta: string; status: "sucesso" | "erro"; dataHora: Date;
}

export const auditLog: AuditEntry[] = [];
let identity = { id: '', nome: '', perfil: '' };
export function setAuditUser(user: typeof identity) { if(identity.id!==user.id)auditLog.splice(0);identity=user; }
export function recordAudit(action:string,status:'sucesso'|'erro',summary=''){if(!identity.id)return;auditLog.unshift({id:crypto.randomUUID(),usuario:identity.nome,perfil:identity.perfil,userId:identity.id,acao:action,payload:summary.slice(0,160),resposta:status,status,dataHora:new Date()});}
export let modoDemonstracao = true;
export const setModoDemonstracao = (v: boolean) => { modoDemonstracao = v; };

async function call<T = { ok: true }>(acao: N8nAction, payload: Record<string, unknown>, mock: () => T): Promise<T> {
  const entry: AuditEntry = {
    id: crypto.randomUUID(), usuario: identity.nome, perfil: identity.perfil, userId: identity.id, acao,
    payload: Object.keys(payload).join(', '), resposta: "", status: "sucesso", dataHora: new Date(),
  };
  try {
    if (!identity.id) throw new Error('Identidade do usuário ainda não carregada.');
    if (!modoDemonstracao) throw new Error("Integração n8n ainda não conectada");
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    const res = mock();
    entry.resposta = 'Simulado — nenhum envio real';
    return res;
  } catch (e) {
    entry.status = "erro";
    entry.resposta = (e as Error).message;
    throw e;
  } finally {
    auditLog.unshift(entry);
  }
}

const ok = () => ({ ok: true as const });
export const n8n = {
  enviarMensagem: (p: { conversaId: string; texto: string }) => call("enviarMensagem", p, ok),
  enviarHorarios: (p: { conversaId: string; horarios: string[] }) => call("enviarHorarios", p, ok),
  solicitarDocumentos: (p: { conversaId: string; documentos?:string[]; texto?:string }) => call("solicitarDocumentos", p, ok),
  gerarContrato: (p: { clienteId: string; documentos?:string[]; texto?:string }) => call("gerarContrato", p, () => ({ ok: true, link: "https://app.zapsign.com.br/demo" })),
  gerarCobranca: (p: { clienteId: string; valor: number; descricao?:string; vencimento?:string }) => call("gerarCobranca", p, () => ({ ok: true, link: "https://mpago.la/demo" })),
  agendarRetorno: (p: { clienteId: string; horario: string }) => call("agendarRetorno", p, ok),
  criarPastaCliente: (p: { clienteId: string }) => call("criarPastaCliente", p, ok),
  iniciarProducao: (p: { casoId: string }) => call("iniciarProducao", p, ok),
  buscarJurisprudencia: (p: { termo: string }) => call("buscarJurisprudencia", p, ok),
  executarAuditoriaIA: (p: { casoId: string }) => call("executarAuditoriaIA", p, ok),
  autuar: (p: { casoId: string }) => call("autuar", p, ok),
  vincularProcessoProjuris: (p: { casoId: string; cnj: string }) => call("vincularProcessoProjuris", p, ok),
  sincronizarEtapaProjuris: (p: { casoId: string; etapa: string }) => call("sincronizarEtapaProjuris", p, ok),
  enviarAvisoAndamento: (p: { processo: string; texto?:string }) => call("enviarAvisoAndamento", p, ok),
  enviarListaProvas: (p: { conversaId: string }) => call("enviarListaProvas", p, ok),
  obterHorariosLivres: (p:{sextas?:boolean})=>call('obterHorariosLivres',p,()=>({slots:freeSlots(new Date(),p.sextas)})),
  agendarConsulta:(p:{clienteId:string;horario:string})=>call('agendarConsulta',p,ok),
  iniciarVideochamada:(p:{clienteId:string})=>call('iniciarVideochamada',p,()=>({link:`https://meet.google.com/demo-${p.clienteId.slice(0,8)}`})),
  solicitarFaltantes:(p:{conversaId:string;documentos:string[];texto?:string})=>call('solicitarFaltantes',p,ok),
  enviarAnexo:(p:{conversaId:string;nome:string})=>call('enviarAnexo',p,ok),
};
