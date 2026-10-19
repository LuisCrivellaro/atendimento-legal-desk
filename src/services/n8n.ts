// Camada de integração com o n8n. Em produção, cada ação chama a função "n8n-proxy"
// no servidor, que adiciona o segredo X-Webhook-Secret. Aqui, em modo demonstração, usa mocks.

export type N8nAction =
  | "enviarMensagem" | "enviarHorarios" | "solicitarDocumentos" | "gerarContrato"
  | "gerarCobranca" | "agendarRetorno" | "criarPastaCliente" | "iniciarProducao"
  | "buscarJurisprudencia" | "executarAuditoriaIA" | "autuar" | "vincularProcessoProjuris"
  | "sincronizarEtapaProjuris" | "enviarAvisoAndamento" | "enviarListaProvas";

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
};

export interface AuditEntry {
  id: string; usuario: string; acao: N8nAction; payload: string;
  resposta: string; status: "sucesso" | "erro"; dataHora: Date;
}

export const auditLog: AuditEntry[] = [];
export let modoDemonstracao = true;
export const setModoDemonstracao = (v: boolean) => { modoDemonstracao = v; };

async function call<T = { ok: true }>(acao: N8nAction, payload: Record<string, unknown>, mock: () => T): Promise<T> {
  const entry: AuditEntry = {
    id: crypto.randomUUID(), usuario: "Dra. Carolina Santos", acao,
    payload: JSON.stringify(payload).slice(0, 160), resposta: "", status: "sucesso", dataHora: new Date(),
  };
  try {
    if (!modoDemonstracao) throw new Error("Integração n8n ainda não conectada");
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    const res = mock();
    entry.resposta = JSON.stringify(res).slice(0, 160);
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
  solicitarDocumentos: (p: { conversaId: string }) => call("solicitarDocumentos", p, ok),
  gerarContrato: (p: { clienteId: string }) => call("gerarContrato", p, () => ({ ok: true, link: "https://app.zapsign.com.br/demo" })),
  gerarCobranca: (p: { clienteId: string; valor: number }) => call("gerarCobranca", p, () => ({ ok: true, link: "https://mpago.la/demo" })),
  agendarRetorno: (p: { clienteId: string; horario: string }) => call("agendarRetorno", p, ok),
  criarPastaCliente: (p: { clienteId: string }) => call("criarPastaCliente", p, ok),
  iniciarProducao: (p: { casoId: string }) => call("iniciarProducao", p, ok),
  buscarJurisprudencia: (p: { termo: string }) => call("buscarJurisprudencia", p, ok),
  executarAuditoriaIA: (p: { casoId: string }) => call("executarAuditoriaIA", p, ok),
  autuar: (p: { casoId: string }) => call("autuar", p, ok),
  vincularProcessoProjuris: (p: { casoId: string; cnj: string }) => call("vincularProcessoProjuris", p, ok),
  sincronizarEtapaProjuris: (p: { casoId: string; etapa: string }) => call("sincronizarEtapaProjuris", p, ok),
  enviarAvisoAndamento: (p: { processo: string }) => call("enviarAvisoAndamento", p, ok),
  enviarListaProvas: (p: { conversaId: string }) => call("enviarListaProvas", p, ok),
};
