import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { mesmoTelefone } from '../projuris/telefone';
import { horarioRelatorioDevido, itensRelatorioAdvogado, textoRelatorioAdvogado } from './encaminhamento-advogado';
import { lerConfigEncaminhamento, CONFIG_ENCAMINHAMENTO_PADRAO, type ConfigEncaminhamento } from './secretaria/encaminhamento-config';
import { urlPublicaApp } from './url-publica';
import type { ResultadoEnvio } from './canais/tipos';

type Db = SupabaseClient<Database>;

/**
 * Relatório consolidado de pendências no WhatsApp do advogado responsável (Fernando), nos horários da configuração
 * central (padrão 09:00 e 16:00, America/Sao_Paulo), executado pelo monitor de 5 minutos — funciona sem ninguém
 * com o Manager aberto. Uma mensagem por horário e destinatário, reservada em `ana_monitoramento` antes do envio:
 * - recusa definitiva do UltraMsg → nova tentativa (até 3, com 5 min de intervalo, dentro da janela do horário);
 * - falha sem resposta do provedor (pode ter saído) → "incerto", sem reenvio automático (nunca duplica);
 * - o envio só lê as conversas: a situação das pendências nunca muda por causa do relatório.
 */
export interface EstadoRelatorioAdvogado {
  estado: 'enviando' | 'enviado' | 'falhou' | 'incerto' | 'bloqueado';
  tentativas: number;
  reservadoEm: string;
  ultimaTentativa: string;
  pendentes?: number | undefined;
  enviadoEm?: string | undefined;
  idExterno?: string | undefined;
  erro?: string | undefined;
}
export const MAX_TENTATIVAS_RELATORIO = 3;
const INTERVALO_TENTATIVA_MS = 5 * 60000;
/** Reserva "enviando" sem desfecho depois disto: o ciclo caiu no meio do envio → incerto (sem reenvio). */
const RESERVA_VENCIDA_MS = 2 * 60000;

/** O que fazer com o horário devido, dado o registro dele (puro, testado). */
export function planoRelatorio(r: EstadoRelatorioAdvogado | undefined, agora = new Date()): 'reservar' | 'retentar' | 'marcar_incerto' | 'pular' {
  if (!r) return 'reservar';
  if (r.estado === 'falhou') return r.tentativas < MAX_TENTATIVAS_RELATORIO && agora.getTime() - Date.parse(r.ultimaTentativa) >= INTERVALO_TENTATIVA_MS ? 'retentar' : 'pular';
  if (r.estado === 'enviando') return agora.getTime() - Date.parse(r.ultimaTentativa) >= RESERVA_VENCIDA_MS ? 'marcar_incerto' : 'pular';
  return 'pular';
}

export function idRelatorio(numero: string, dia: string, horario: string) {
  return `relatorio-advogado:${numero}:${dia}T${horario}`;
}

interface Destinatario { numero: string; responsavel: string; horarios: string[]; owners: Set<string>; padrao: boolean }

/** Destinatários pela configuração de cada área de trabalho (sem configuração = padrão); mesmo número = um envio. */
function destinatarios(workspaces: { owner_id: string; dados: unknown }[]): { lista: Destinatario[]; configPorOwner: Map<string, ConfigEncaminhamento> } {
  const configPorOwner = new Map(workspaces.map(w => [w.owner_id, lerConfigEncaminhamento((w.dados as { secretaria?: { encaminhamento?: unknown } } | null)?.secretaria?.encaminhamento)]));
  const porNumero = new Map<string, Destinatario>();
  const registrar = (cfg: ConfigEncaminhamento, owner: string | undefined) => {
    if (!cfg.relatorioAtivo || !cfg.whatsapp) return;
    const d = porNumero.get(cfg.whatsapp) ?? { numero: cfg.whatsapp, responsavel: cfg.responsavel, horarios: [], owners: new Set<string>(), padrao: false };
    d.horarios = [...new Set([...d.horarios, ...cfg.horarios])].sort();
    if (owner) d.owners.add(owner); else d.padrao = true;
    porNumero.set(cfg.whatsapp, d);
  };
  for (const [owner, cfg] of configPorOwner) registrar(cfg, owner);
  // Áreas de trabalho sem configuração gravada usam o padrão (Fernando).
  registrar(CONFIG_ENCAMINHAMENTO_PADRAO, undefined);
  return { lista: [...porNumero.values()], configPorOwner };
}

export async function enviarRelatoriosAdvogado(db: Db, agora = new Date(), deps: { enviar?: (numero: string, texto: string) => Promise<ResultadoEnvio>; base?: string } = {}) {
  const ws = await db.from('office_workspace').select('owner_id,dados');
  if (ws.error) throw new Error('Configuração indisponível.');
  const { lista, configPorOwner } = destinatarios((ws.data ?? []) as { owner_id: string; dados: unknown }[]);
  const devidos = lista.flatMap(d => { const h = horarioRelatorioDevido(d.horarios, agora); return h ? [{ d, ...h, id: idRelatorio(d.numero, h.dia, h.horario) }] : []; });
  if (!devidos.length) return { devidos: 0, enviados: 0, falhas: 0 };
  const enviar = deps.enviar ?? (async (numero: string, texto: string) => (await import('./canais/ultramsg')).enviarTextoResponsavel(numero, texto));
  const base = deps.base ?? urlPublicaApp(process.env['PUBLIC_APP_URL']);
  let casos: { id: string; owner_id: string; dados: Conversa }[] | undefined;
  const resultado = { devidos: devidos.length, enviados: 0, falhas: 0, incertos: 0, pendentes: 0 };
  for (const { d, horario, id } of devidos) {
    const atual = await db.from('ana_monitoramento').select('estado').eq('id', id).maybeSingle();
    if (atual.error) throw new Error('Registro do relatório indisponível.');
    const registro = (atual.data?.estado ?? undefined) as unknown as EstadoRelatorioAdvogado | undefined;
    const plano = planoRelatorio(registro, agora);
    if (plano === 'pular') continue;
    if (plano === 'marcar_incerto') {
      await db.from('ana_monitoramento').update({ estado: { ...registro, estado: 'incerto', erro: 'Envio interrompido no meio; não reenviado para não duplicar.' } as unknown as Json, verificado_em: agora.toISOString() }).eq('id', id).eq('estado->>estado', 'enviando');
      await db.rpc('registrar_audit_log', { p_ator: 'Anne', p_perfil: 'sistema', p_acao: 'relatorioAdvogado', p_resumo: `Relatório das ${horario} para ${d.responsavel}: envio não confirmado (não reenviado)`, p_status: 'erro', p_erro: 'Envio interrompido; conferir o WhatsApp do responsável.' });
      resultado.incertos++;
      continue;
    }
    const tentativas = (registro?.tentativas ?? 0) + 1;
    const reserva: EstadoRelatorioAdvogado = { estado: 'enviando', tentativas, reservadoEm: registro?.reservadoEm ?? agora.toISOString(), ultimaTentativa: agora.toISOString() };
    // Reserva atômica: inserção (primeira vez) ou atualização condicional (nova tentativa da mesma falha).
    const reservado = plano === 'reservar'
      ? !(await db.from('ana_monitoramento').insert({ id, estado: reserva as unknown as Json, verificado_em: agora.toISOString() })).error
      : !!(await db.from('ana_monitoramento').update({ estado: reserva as unknown as Json, verificado_em: agora.toISOString() }).eq('id', id).eq('estado->>estado', 'falhou').eq('estado->>tentativas', String(registro?.tentativas ?? 0)).select('id')).data?.length;
    if (!reservado) continue;
    if (!casos) {
      const rows = await db.from('casos').select('id,owner_id,dados').not('dados->>encaminhamentos', 'is', null);
      if (rows.error) throw new Error('Conversas indisponíveis.');
      casos = (rows.data ?? []) as unknown as { id: string; owner_id: string; dados: Conversa }[];
    }
    // Destinatário exclusivo: nunca um número que pertença a um contato de cliente.
    const deCliente = casos.some(c => mesmoTelefone(c.dados.telefone ?? '', d.numero));
    const conversas = casos.filter(c => d.owners.has(c.owner_id) || d.padrao && !configPorOwner.has(c.owner_id)).map(c => ({ id: c.id, conversa: c.dados }));
    const itens = itensRelatorioAdvogado(conversas, base, agora);
    let final: EstadoRelatorioAdvogado;
    if (deCliente) {
      final = { ...reserva, estado: 'bloqueado', erro: 'O número configurado pertence a um contato de cliente.' };
    } else {
      const r = await enviar(d.numero, textoRelatorioAdvogado(itens, agora, d.responsavel)).catch((): ResultadoEnvio => ({ ok: false, erro: 'Falha de comunicação com o UltraMsg.', ambiguo: true }));
      final = r.ok ? { ...reserva, estado: 'enviado', enviadoEm: agora.toISOString(), pendentes: itens.length, ...(r.idExterno ? { idExterno: r.idExterno } : {}) }
        : { ...reserva, estado: r.ambiguo ? 'incerto' : 'falhou', pendentes: itens.length, erro: (r.erro ?? 'Envio recusado.').slice(0, 160) };
    }
    await db.from('ana_monitoramento').update({ estado: final as unknown as Json, verificado_em: agora.toISOString() }).eq('id', id);
    const ok = final.estado === 'enviado';
    await db.rpc('registrar_audit_log', {
      p_ator: 'Anne', p_perfil: 'sistema', p_acao: 'relatorioAdvogado',
      p_resumo: `Relatório das ${horario} para ${d.responsavel}: ${itens.length} cliente(s) pendente(s) · tentativa ${tentativas} · ${final.estado}`,
      p_status: ok ? 'sucesso' : final.estado === 'bloqueado' ? 'bloqueado' : 'erro',
      ...(ok ? {} : { p_erro: final.erro ?? 'Envio não confirmado.' }),
    });
    if (ok) { resultado.enviados++; resultado.pendentes += itens.length; } else if (final.estado === 'incerto') resultado.incertos++; else resultado.falhas++;
  }
  return resultado;
}
