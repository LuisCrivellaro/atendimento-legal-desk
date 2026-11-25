// Ações externas: mensagens do Atendimento passam pelo canal (enviarMensagemCanal);
// as demais seguem simuladas até uma integração real ser conectada.
import { enviarMensagemCanal, lerConfigCanal, registrarAuditoria } from '@/lib/atendimento/envio.functions';
import { simulacaoPermitida, MSG_INTEGRACAO_NAO_CONECTADA } from '@/lib/atendimento/trava-simulacao';

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

let identity = { id: '', nome: '', perfil: '' };
export function setAuditUser(user: typeof identity) { identity = user; }

/** Grava a ação no log de auditoria do banco; nunca envia telefone, chat_id ou texto integral. */
export function recordAudit(action: string, status: 'sucesso' | 'erro', summary = '') {
  if (!identity.id) return;
  void registrarAuditoria({
    data: { ator: identity.nome, perfil: identity.perfil, acao: action, resumo: summary.slice(0, 160), status, erro: status === 'erro' ? summary.slice(0, 160) : undefined },
  }).catch(() => {});
}

async function call<T = { ok: true }>(acao: N8nAction, mock: () => T | Promise<T>): Promise<T> {
  try {
    if (!identity.id) throw new Error('Identidade do usuário ainda não carregada.');
    let canal: string | undefined;
    try { canal = (await lerConfigCanal()).config.canal_ativo; } catch { canal = undefined; }
    if (!simulacaoPermitida(canal)) throw new Error(MSG_INTEGRACAO_NAO_CONECTADA);
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    const res = await mock();
    recordAudit(acao, 'sucesso', 'Simulado — nenhum envio real');
    return res;
  } catch (e) {
    recordAudit(acao, 'erro', (e as Error).message);
    throw e;
  }
}

/** Mensagens do Atendimento: enviadas pelo servidor através do canal ativo. */
async function viaCanal(acao: N8nAction, p: { conversaId: string; texto: string; horarios?: string[] }) {
  try {
    const r = await enviarMensagemCanal({ data: { conversaId: p.conversaId, acao, texto: p.texto, ...(p.horarios?.length ? { horarios: p.horarios } : {}) } });
    recordAudit(acao, 'sucesso', r.simulado ? 'Simulado — canal desligado' : 'Enviado pelo canal');
    return r;
  } catch (e) {
    recordAudit(acao, 'erro', (e as Error).message);
    throw e;
  }
}

const ok = () => ({ ok: true as const });
export const n8n = {
  enviarMensagem: (p: { conversaId: string; texto: string }) => viaCanal("enviarMensagem", p),
  enviarHorarios: (p: { conversaId: string; texto: string; horarios?: string[] }) => viaCanal("enviarHorarios", p),
  solicitarDocumentos: (p: { conversaId: string; texto: string }) => viaCanal("solicitarDocumentos", p),
  solicitarFaltantes: (p: { conversaId: string; texto: string }) => viaCanal("solicitarFaltantes", p),
  enviarListaProvas: (p: { conversaId: string; texto: string }) => viaCanal("enviarListaProvas", p),
  // Atendimento (25/11/2026): contrato, cobrança, retorno, pasta, agenda, videochamada e anexo não são mais simulados.
  // Contrato = link do ProJuris enviado pelo canal; pasta = criarPastaDrive; agenda = agenda-equipe.functions;
  // Meet = link do recibo; anexo = enviarAnexoCanal; cobrança = "não configurado" até o Mercado Pago.
  iniciarProducao: (p: { casoId: string }) => call("iniciarProducao", ok),
  buscarJurisprudencia: (p: { termo: string }) => call("buscarJurisprudencia", ok),
  executarAuditoriaIA: (p: { casoId: string }) => call("executarAuditoriaIA", ok),
  autuar: (p: { casoId: string }) => call("autuar", ok),
  vincularProcessoProjuris: (p: { casoId: string; cnj: string }) => call("vincularProcessoProjuris", ok),
  sincronizarEtapaProjuris: (p: { casoId: string; etapa: string }) => call("sincronizarEtapaProjuris", ok),
  enviarAvisoAndamento: (p: { processo: string; texto?:string }) => call("enviarAvisoAndamento", ok),
};
