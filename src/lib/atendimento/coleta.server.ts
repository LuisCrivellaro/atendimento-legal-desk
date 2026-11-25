import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { OfficeState } from '../office';
import { defaultAutomations, newMessage } from '../atendimento';
import { textosColeta } from '../respostas-prontas';
import { atualizarConversa } from './ana.server';
import { registrarAviso } from './avisos-equipe';
import { LIMITE_LEMBRETES_COLETA, decidirLembretesColeta, emColeta, preencherColeta, registrarLembreteColeta, type DecisaoColeta } from './coleta';

type Db = SupabaseClient<Database>;

export const LIMITE_LEMBRETES_POR_CICLO = 20;
export const ORCAMENTO_COLETA_MS = 40000;

/**
 * Lembretes de coleta no servidor (substituem os do navegador): contrato sem assinatura 24 h depois do envio real
 * e faltantes a cada 48 h, só em dia útil das 9h às 17h30, no máximo 3 por pendência (D3) e depois aviso à equipe.
 * Mesmas regras de destino do lembrete das 08:00; reserva antes de enviar; nunca reenvia depois de falha.
 * Modo Sugerir, controle humano, pausa ou contato não liberado: aviso com texto pronto, sem envio. Desligada: nada.
 */
export async function enviarLembretesColeta(db: Db, agora = new Date(), relogio: () => number = () => Date.now()) {
  const comeco = relogio();
  const res = { enviados: 0, avisos: 0, falhas: 0, adiados: 0 };
  const cfg = await db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id', true).single();
  if (cfg.error) throw new Error('Configuração indisponível.');
  if (cfg.data.canal_ativo !== 'ultramsg' || !cfg.data.agente_ativo) return { ...res, motivo: 'canal ou Anne desligados' };
  const [docs, contratos] = await Promise.all([
    db.from('casos').select('id,owner_id,dados').eq('etapa', 'documentos'),
    db.from('casos').select('id,owner_id,dados').in('dados->>contrato', ['enviado', 'visualizado']),
  ]);
  if (docs.error || contratos.error) throw new Error('Atendimentos indisponíveis.');
  const rows = [...new Map([...(docs.data ?? []), ...(contratos.data ?? [])].map(r => [r.id, r])).values()];
  if (!rows.length) return res;
  const ids = rows.map(r => r.id);
  const donos = [...new Set(rows.map(r => r.owner_id))];
  const [itens, contatos, ws] = await Promise.all([
    db.from('checklist_itens').select('caso_id,nome,recebido').in('caso_id', ids),
    db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado').in('conversa_id', ids),
    db.from('office_workspace').select('owner_id,dados').in('owner_id', donos),
  ]);
  if (itens.error || contatos.error || ws.error) throw new Error('Checklist, contatos ou automações indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  const estados = new Map((ws.data ?? []).map(w => [w.owner_id, w.dados as unknown as OfficeState]));
  const { enviarMensagemSistema } = await import('./envio.functions');

  for (const row of rows) {
    if (res.enviados >= LIMITE_LEMBRETES_POR_CICLO || relogio() - comeco > ORCAMENTO_COLETA_MS) { res.adiados++; continue; }
    const c = row.dados as unknown as Conversa;
    const state = estados.get(row.owner_id);
    const modo = c.modoIA ?? state?.automations?.modoIA ?? defaultAutomations.modoIA;
    if (modo === 'Desligada') continue;
    const faltantes = (itens.data ?? []).filter(i => i.caso_id === row.id && !i.recebido).map(i => i.nome);
    const automacoes = { contrato: state?.automations?.lembreteContrato ?? defaultAutomations.lembreteContrato, faltantes: state?.automations?.lembreteFaltantes ?? defaultAutomations.lembreteFaltantes };
    const decisoes = decidirLembretesColeta({ contrato: c.contrato, contratoLink: c.contratoLink, contratoEnviadoEm: c.contratoEnviadoEm, emColeta: emColeta(c), faltantes, ultimoPedidoDocumentos: c.ultimoPedidoDocumentos, estado: c.agenteAna?.lembretesColeta, automacoes }, agora);
    if (!decisoes.length) continue;
    const textos = textosColeta(state?.respostasProntas);
    const nome = c.agenteAna?.dados?.nome || c.nome;
    const contato = porConversa.get(row.id);
    for (const d of decisoes) {
      if (d.tipo === 'limite') {
        const texto = d.pendencia === 'contrato'
          ? `Contrato ainda sem assinatura depois de ${LIMITE_LEMBRETES_COLETA} lembretes: contatar o cliente.`
          : `Documentos ainda pendentes depois de ${LIMITE_LEMBRETES_COLETA} lembretes: ${d.itens.join(', ')}. Contatar o cliente.`;
        await atualizarConversa(db, row.id, x => registrarAviso(
          { ...x, agenteAna: { ...x.agenteAna, lembretesColeta: registrarLembreteColeta(x.agenteAna?.lembretesColeta, d, agora) } },
          { id: `coleta-limite:${d.pendencia}:${d.pendencia === 'contrato' ? x.contratoLink ?? '' : d.itens.join('|')}`, tipo: 'coleta', criadoEm: agora.toISOString(), texto },
        ));
        res.avisos++;
        continue;
      }
      const texto = d.tipo === 'contrato' ? preencherColeta(textos.lembreteContrato, { nome, link: d.link }) : preencherColeta(textos.lembreteFaltantes, { nome, faltantes: d.itens });
      if (/\{[^{}\n]{1,40}\}/.test(texto)) { console.error('Lembrete de coleta com campo sem dado; nada enviado.'); continue; }
      const motivoBloqueio = !contato ? 'sem contato de WhatsApp liberado' : c.agenteAna?.humano ? 'conversa com a equipe' : c.agenteAna?.pausa || state?.anaPausa?.ativa ? 'Anne pausada' : modo === 'Sugerir' ? 'modo Sugerir' : '';
      if (motivoBloqueio) {
        await atualizarConversa(db, row.id, x => registrarAviso(x, { id: idLembrete(x, d), tipo: 'coleta', criadoEm: agora.toISOString(), texto: `${d.tipo === 'contrato' ? 'Lembrete do contrato' : 'Lembrete de documentos faltantes'} vencido e não enviado (${motivoBloqueio}). Texto pronto para revisar e enviar.`, textoPronto: texto }));
        res.avisos++;
        continue;
      }
      let reservado = false;
      await atualizarConversa(db, row.id, x => {
        reservado = false;
        if (x.agenteAna?.humano || x.agenteAna?.pausa) return x;
        if (d.tipo === 'contrato' && (x.contratoLink !== d.link || !(x.contrato === 'enviado' || x.contrato === 'visualizado'))) return x;
        if (d.tipo === 'faltantes' && !emColeta(x)) return x;
        // Mesma decisão sobre o estado atual: dois ciclos simultâneos nunca enviam o mesmo lembrete.
        const ainda = decidirLembretesColeta({ contrato: x.contrato, contratoLink: x.contratoLink, contratoEnviadoEm: x.contratoEnviadoEm, emColeta: emColeta(x), faltantes, ultimoPedidoDocumentos: x.ultimoPedidoDocumentos, estado: x.agenteAna?.lembretesColeta, automacoes }, agora);
        if (!ainda.some(a => a.tipo === d.tipo)) return x;
        reservado = true;
        return { ...x, agenteAna: { ...x.agenteAna, lembretesColeta: registrarLembreteColeta(x.agenteAna?.lembretesColeta, d, agora), envioAna: { mensagemId: `coleta:${d.tipo}:${agora.toISOString()}`, texto, desde: agora.toISOString() } } };
      });
      if (!reservado) continue;
      try {
        const sent = await enviarMensagemSistema({ supabase: db, conversaId: row.id, texto, motivo: d.tipo === 'contrato' ? 'lembreteContrato' : 'lembreteFaltantes', ...(contato ? { contatoEsperado: contato } : {}) });
        if (sent.simulado) throw new Error('Canal desligado.');
        await atualizarConversa(db, row.id, x => ({
          ...x,
          mensagens: [...x.mensagens, newMessage(texto, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada' })],
          timeline: [...x.timeline, { data: agora.toISOString(), evento: d.tipo === 'contrato' ? `Lembrete do contrato enviado pela Anne (${d.numero}/${LIMITE_LEMBRETES_COLETA})` : `Lembrete de documentos faltantes enviado pela Anne: ${d.itens.join(', ')}` }],
        }));
        res.enviados++;
      } catch (error) {
        res.falhas++;
        console.error('Lembrete de coleta não enviado', error);
        await atualizarConversa(db, row.id, x => registrarAviso(x, { id: `coleta-falha:${d.tipo}:${agora.toISOString()}`, tipo: 'coleta', criadoEm: agora.toISOString(), texto: `${d.tipo === 'contrato' ? 'Lembrete do contrato' : 'Lembrete de faltantes'} não confirmado pelo WhatsApp. Conferir a conversa; não reenviar sem conferir.` })).catch(() => undefined);
        await db.rpc('registrar_audit_log', { p_ator: 'Ana', p_perfil: 'sistema', p_acao: 'lembreteColeta', p_resumo: 'Lembrete de coleta não confirmado; equipe deve conferir', p_status: 'erro', p_erro: 'Envio do lembrete não confirmado.' });
      }
    }
  }
  return res;
}

/** Id estável do aviso de lembrete não enviado: o mesmo vencimento nunca gera dois avisos. */
function idLembrete(x: Conversa, d: DecisaoColeta) {
  if (d.tipo === 'contrato') return `coleta-contrato:${d.link}:${d.numero}`;
  const desde = [x.ultimoPedidoDocumentos, x.agenteAna?.lembretesColeta?.ultimoFaltantesEm].filter(Boolean).sort().at(-1) ?? '';
  return `coleta-faltantes:${desde}`;
}
