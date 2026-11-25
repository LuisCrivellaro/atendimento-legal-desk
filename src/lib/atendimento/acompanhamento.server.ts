import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { OfficeState } from '../office';
import { newMessage } from '../atendimento';
import { mergeReplies, DEFAULT_REPLIES } from '../respostas-prontas';
import { atualizarConversa } from './ana.server';
import { PERGUNTA_ENCERRAMENTO, chaveEvento, dataHoraDoEvento, deveEnviarEncerramento, eventoPodeAvisar, rascunhoAvisoEvento, tipoEventoProcessual, type EventoOficial } from './acompanhamento';
import { hashTexto, mensagemRevisora, proximoCodigo, type PedidoProcesso } from './consulta-processo';
import type { AndamentoPJ } from '../projuris/processos';

type Db = SupabaseClient<Database>;

async function estadoDoDono(db: Db, conversaId: string) {
  const row = await db.from('casos').select('owner_id').eq('id', conversaId).single();
  if (row.error) return undefined;
  const ws = await db.from('office_workspace').select('dados').eq('owner_id', row.data.owner_id).maybeSingle();
  return ws.error ? undefined : (ws.data?.dados as unknown as OfficeState | undefined);
}

/**
 * Pergunta de encerramento (S3/D4) logo depois de uma notícia aprovada ser entregue com recibo.
 * Uma vez por pedido; reservada antes do envio; nunca reenvia. Falha não desfaz a notícia já entregue.
 */
export async function enviarEncerramentoProcesso(db: Db, conversaId: string, contato: string, p: Pick<PedidoProcesso, 'codigo' | 'selecaoProcessos' | 'evento'>, acao: 'aprovar' | 'corrigir' | 'recusar') {
  const state = await estadoDoDono(db, conversaId);
  const texto = mergeReplies(state?.respostasProntas).find(r => r.id === PERGUNTA_ENCERRAMENTO.id)?.texto?.trim() || PERGUNTA_ENCERRAMENTO.texto;
  let reservado = false;
  const agora = new Date().toISOString();
  await atualizarConversa(db, conversaId, x => {
    reservado = false;
    if (!deveEnviarEncerramento(p, acao, x.agenteAna?.encerramentoProcesso) || x.agenteAna?.humano || x.agenteAna?.pausa) return x;
    reservado = true;
    return { ...x, agenteAna: { ...x.agenteAna, encerramentoProcesso: { codigo: p.codigo, reservadoEm: agora }, envioAna: { mensagemId: `encerramento:${p.codigo}`, texto, desde: agora } } };
  });
  if (!reservado) return false;
  const { enviarMensagemSistema } = await import('./envio.functions');
  const sent = await enviarMensagemSistema({ supabase: db, conversaId, texto, contatoEsperado: contato, motivo: 'encerramento_processo' });
  if (sent.simulado) throw new Error('Canal desligado; pergunta não enviada.');
  await atualizarConversa(db, conversaId, x => ({
    ...x,
    agenteAna: { ...x.agenteAna, encerramentoProcesso: { codigo: p.codigo, reservadoEm: agora, enviadoEm: new Date().toISOString(), idExterno: sent.idExterno } },
    mensagens: [...x.mensagens, newMessage(texto, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada' })],
  }));
  return true;
}

/** Evento novo de verdade: data do evento hoje ou adiante; sem data no registro, só andamento recente (7 dias). */
export function eventoAtual(e: Pick<EventoOficial, 'data'>, dataAndamento: string | undefined, agora = new Date()) {
  if (e.data) {
    const [d, m, a] = e.data.split('/').map(Number);
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` >= hoje;
  }
  const t = Date.parse(dataAndamento ?? '');
  return Number.isFinite(t) && agora.getTime() - t <= 7 * 86400_000 && t <= agora.getTime() + 86400_000;
}

/**
 * Sincronização do ProJuris trouxe audiência/perícia para um cliente com vínculo confirmado: cria rascunho na fila
 * da revisora (Aprovar, Corrigir ou Recusar). Nada vai ao cliente antes da aprovação. Só leitura no ProJuris.
 */
export async function criarAvisosEventos(db: Db, owner: string, codigoProcesso: number, movimentos: AndamentoPJ[], agora = new Date()) {
  const { lerBase } = await import('../projuris/base.server');
  const { processosDaBase } = await import('../projuris/base');
  const { processoDe } = await import('../projuris/mapeamento');
  const { ultimosAndamentosPublicos, identificacaoProcesso } = await import('../projuris/processos');
  const { base } = await lerBase(db, owner);
  if (!base) return { criados: 0 };
  const bruto = processosDaBase(base).find(p => p['codigoProcesso'] === codigoProcesso);
  const proc = bruto ? processoDe(bruto) : undefined;
  if (!proc) return { criados: 0 };
  const candidatos = movimentos.flatMap(m => {
    const tipo = tipoEventoProcessual(`${m.tipo ?? ''} ${m.descricao}`);
    if (!tipo) return [];
    const e: EventoOficial = { codigoProcesso, ...(proc.numero ? { numero: proc.numero } : {}), ...(proc.vara ? { vara: proc.vara } : {}), tipo, descricao: m.descricao, ...dataHoraDoEvento(m.descricao), privado: m.privado, segredoJustica: proc.segredoJustica };
    return eventoPodeAvisar(e) && eventoAtual(e, m.data, agora) ? [{ e, m }] : [];
  });
  if (!candidatos.length) return { criados: 0 };
  const pessoas = new Set(proc.envolvidos.filter(x => x.cliente).map(x => x.codigoPessoa));
  const casos = await db.from('casos').select('id,dados').eq('owner_id', owner).eq('dados->agenteAna->vinculoProjuris->>status', 'confirmado');
  if (casos.error) throw new Error('Conversas indisponíveis.');
  const ws = await db.from('office_workspace').select('dados').eq('owner_id', owner).maybeSingle();
  const replies = mergeReplies((ws.data?.dados as unknown as OfficeState | undefined)?.respostasProntas);
  const modelo = (atalho: string) => replies.find(r => r.atalho === atalho)?.texto ?? DEFAULT_REPLIES.find(r => r.atalho === atalho)?.texto ?? '';
  const modelos = { audiencia: modelo('audiencia'), pericia: modelo('pericia') };
  const { reservarCodigo } = await import('./consulta-processo.server');
  const { enviarTextoRevisora } = await import('./canais/ultramsg');
  let criados = 0;
  for (const caso of casos.data ?? []) {
    const c = caso.dados as unknown as Conversa;
    const vinculo = c.agenteAna?.vinculoProjuris;
    if (!vinculo || vinculo.status !== 'confirmado' || !pessoas.has(vinculo.codigoPessoa)) continue;
    for (const { e, m } of candidatos) {
      const chave = chaveEvento(e);
      if (c.agenteAna?.avisosEventos?.includes(chave)) continue;
      const codigo = proximoCodigo(await reservarCodigo(db, owner));
      const nome = c.agenteAna?.dados?.nome || vinculo.nome || c.nome;
      const texto = rascunhoAvisoEvento(e, nome, modelos);
      const pedido: PedidoProcesso = {
        codigo, conversaId: caso.id, contato: { nome, telefone: c.agenteAna?.telefone ?? c.telefone }, identificadoPor: 'vínculo confirmado no ProJuris',
        processos: [{ codigo: codigoProcesso, identificacao: identificacaoProcesso(proc), ...(proc.numero ? { numero: proc.numero } : {}), ...(proc.assunto ? { assunto: proc.assunto } : {}), segredo: false, andamentos: ultimosAndamentosPublicos([m], 1) }],
        textoProposto: texto, hash: await hashTexto(texto), rascunhoPadrao: true, status: 'pendente', criadoEm: agora.toISOString(), lembretesEm: [], evento: { tipo: e.tipo, chave },
      };
      let criado = false;
      await atualizarConversa(db, caso.id, x => {
        criado = false;
        if (x.agenteAna?.avisosEventos?.includes(chave)) return x;
        criado = true;
        return { ...x, agenteAna: { ...x.agenteAna, avisosEventos: [...(x.agenteAna?.avisosEventos ?? []), chave], pedidosProcesso: [...(x.agenteAna?.pedidosProcesso ?? []), pedido] }, timeline: [...x.timeline, { data: agora.toISOString(), evento: `Aviso de ${e.tipo === 'audiencia' ? 'audiência' : 'perícia'} aguardando revisão (pedido ${codigo})` }] };
      });
      if (!criado) continue;
      criados++;
      const r = await enviarTextoRevisora(mensagemRevisora(pedido)).catch(() => ({ ok: false }));
      if (!r.ok) await db.rpc('registrar_audit_log', { p_ator: 'sistema', p_perfil: 'sistema', p_acao: 'aviso_evento_revisora_pendente', p_resumo: `Pedido ${codigo} criado; revisora não notificada (conferir no Manager ADV)`, p_status: 'erro' });
    }
  }
  return { criados };
}
