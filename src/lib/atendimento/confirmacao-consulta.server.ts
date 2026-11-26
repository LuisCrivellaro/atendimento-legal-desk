import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { OfficeState } from '../office';
import { defaultAutomations, newMessage } from '../atendimento';
import { atualizarConversa } from './ana.server';
import { hora } from './ana-scheduling';
import { registrarAviso } from './avisos-equipe';
import { consultaNoDia, decidirConfirmacao40, faseConfirmacao, textoAvisoConfirmacao, type MotivoAvisoConfirmacao } from './confirmacao-consulta';
import { secretariaLigada } from './secretaria/secretaria.server';
import { lerBiblioteca } from './biblioteca/renderizar';
import { bloqueadoPorTeste, lerConfigSecretaria } from './secretaria/config';
import { consultaSuspensa, situacaoConsulta } from './situacao-consulta';
import { politicaConsultaDia } from './biblioteca/selecao';
import { concluirEnvioRotina, contextoRotina, decidirConfirmacaoSecretaria, motorPermiteRotina, reservarEnvioRotina } from './secretaria/rotinas';

type Db = SupabaseClient<Database>;

/** Rotina prevista a cada 5 minutos; precisa caber nos 60 s da Netlify. O que sobrar fica para o próximo ciclo. */
export const LIMITE_ENVIOS_POR_CICLO = 20;
export const ORCAMENTO_CICLO_MS = 40000;

const idAviso = (inicio: string) => `confirmacao40:${inicio}`;

/**
 * Envia a confirmação de presença (padrão 2 h antes, configurável) das consultas de hoje com recibo verificado, uma única vez por horário.
 * Mesmas regras de destino do lembrete das 08:00 (canal UltraMsg ativo, contato liberado e vinculado, restrições de produção).
 * Janela perdida, controle humano, conversa sem vínculo ou sem recibo: nada é enviado; a equipe recebe um aviso.
 */
export async function enviarConfirmacoesConsulta(db: Db, agora = new Date(), relogio: () => number = () => Date.now()) {
  const comeco = relogio();
  const resultado = { enviados: 0, avisos: 0, falhas: 0, adiados: 0, motivos: {} as Record<string, number> };
  const contar = (motivo: string) => { resultado.motivos[motivo] = (resultado.motivos[motivo] ?? 0) + 1; };
  const cfg = await db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id', true).single();
  if (cfg.error) throw new Error('Configuração indisponível.');
  if (cfg.data.canal_ativo !== 'ultramsg' || !cfg.data.agente_ativo) return { ...resultado, motivo: 'canal ou Anne desligados' };

  // Leitura leve (só o horário) e depois o JSON completo apenas das consultas próximas.
  const lista = await db.from('casos').select('id,consulta:dados->>consultaAgendada').not('dados->>consultaAgendada', 'is', null);
  if (lista.error) throw new Error('Consultas indisponíveis.');
  const proximas = ((lista.data ?? []) as unknown as { id: string; consulta: string | null }[])
    // Consultas de hoje ainda não começadas; a antecedência de cada escritório é conferida na decisão por conversa.
    .filter(r => !!r.consulta && consultaNoDia(r.consulta, agora) && faseConfirmacao(r.consulta, agora, 24 * 60) !== 'passada')
    .sort((a, b) => Date.parse(a.consulta ?? '') - Date.parse(b.consulta ?? ''));
  if (!proximas.length) return resultado;
  const ids = proximas.map(r => r.id);

  const [rows, contatos] = await Promise.all([
    db.from('casos').select('id,owner_id,dados').in('id', ids),
    db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado').in('conversa_id', ids),
  ]);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  if (contatos.error) throw new Error('Contatos indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  const donos = [...new Set(rows.data.map(r => r.owner_id))];
  const ws = await db.from('office_workspace').select('owner_id,dados').in('owner_id', donos);
  if (ws.error) throw new Error('Automações indisponíveis.');
  const estados = new Map((ws.data ?? []).map(w => [w.owner_id, w.dados as unknown as OfficeState]));
  const { enviarMensagemSistema } = await import('./envio.functions');

  const ordem = new Map(ids.map((id, i) => [id, i]));
  for (const row of [...rows.data].sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))) {
    if (resultado.enviados >= LIMITE_ENVIOS_POR_CICLO || relogio() - comeco > ORCAMENTO_CICLO_MS) { resultado.adiados++; continue; }
    const c = row.dados as unknown as Conversa;
    const state = estados.get(row.owner_id);
    const contato = porConversa.get(row.id);
    const configSec = lerConfigSecretaria((state as { secretaria?: unknown } | undefined)?.secretaria);
    // Modo de teste controlado: só o número autorizado recebe; os demais nem geram aviso.
    if (bloqueadoPorTeste(configSec, contato)) { contar('modo de teste'); continue; }
    // Compromisso concluído/inexistente no ProJuris antes do horário: a equipe já recebeu o aviso; nada sai.
    if (consultaSuspensa(c)) { contar('agenda oficial em conferência'); continue; }
    const entrada = {
      antecedenciaMin: configSec.confirmacaoAntecedenciaMin,
      situacao: situacaoConsulta(c).estado,
      consultaAgendada: c.consultaAgendada,
      reservaInicio: c.agenteAna?.reservaCalendar?.inicio,
      confirmacao40: c.agenteAna?.confirmacao40,
      humano: c.agenteAna?.humano,
      pausa: c.agenteAna?.pausa,
      modo: c.modoIA ?? state?.automations?.modoIA ?? defaultAutomations.modoIA,
      anaPausadaGlobal: !!state?.anaPausa?.ativa,
      automacaoLigada: (state?.automations?.lembreteConsulta ?? defaultAutomations.lembreteConsulta) !== false,
      contatoLiberado: !!contato,
      // Biblioteca oficial (02/08.2) e política que impede confirmação redundante (lembrete recente, presença já confirmada).
      biblioteca: lerBiblioteca((state as { bibliotecaMensagens?: unknown } | undefined)?.bibliotecaMensagens),
      ...(c.consultaAgendada ? { politica: politicaConsultaDia(c, c.consultaAgendada, 'confirmacao', agora) } : {}),
    };
    // Secretaria digital ligada: o motor decide pelo modo (Híbrido envia; Humano/Bloqueado avisam a equipe).
    const ctxSecretaria = secretariaLigada(state) ? contextoRotina({ state, agenteAtivo: cfg.data.agente_ativo === true, canalAtivo: cfg.data.canal_ativo === 'ultramsg', contato, modoPadrao: state?.automations?.modoIA ?? defaultAutomations.modoIA }) : undefined;
    const decisao = ctxSecretaria ? decidirConfirmacaoSecretaria(c, entrada, ctxSecretaria, agora) : decidirConfirmacao40(entrada, agora);
    if (decisao.tipo === 'ignorar') { contar(decisao.motivo); continue; }
    if (decisao.tipo === 'aviso') {
      contar(decisao.motivo);
      if (await avisarEquipe(db, row.id, decisao.inicio, decisao.motivo, decisao.texto, agora)) resultado.avisos++;
      continue;
    }
    const { inicio, texto } = decisao;
    const modelo = decisao.modelo;
    const automacaoId = `confirmacao_consulta:${inicio}`;
    let reservado = false;
    let eventoId = '';
    await atualizarConversa(db, row.id, x => {
      reservado = false;
      const r = x.agenteAna?.reservaCalendar;
      const bloqueada = ctxSecretaria ? !motorPermiteRotina(x, ctxSecretaria, 'confirmacao_consulta', agora) : x.agenteAna?.humano || x.agenteAna?.pausa;
      if (!r || x.consultaAgendada !== inicio || r.inicio !== inicio || x.agenteAna?.confirmacao40?.inicio === inicio || bloqueada) return x;
      reservado = true;
      eventoId = r.id;
      const comReserva = { ...x, agenteAna: { ...x.agenteAna, confirmacao40: { inicio, reservadoEm: agora.toISOString() }, envioAna: { mensagemId: `confirmacao40:${r.id}`, texto, desde: agora.toISOString() } } };
      return ctxSecretaria ? reservarEnvioRotina(comReserva, automacaoId, texto, agora) : comReserva;
    });
    if (!reservado) continue;
    try {
      const sent = await enviarMensagemSistema({ supabase: db, conversaId: row.id, texto, motivo: 'confirmacao', ...(contato ? { contatoEsperado: contato } : {}), ...(ctxSecretaria ? { automacaoId } : {}) });
      if (sent.simulado) throw new Error('Canal desligado.');
      await atualizarConversa(db, row.id, x => {
        const enviada: Conversa = {
          ...x,
          agenteAna: { ...x.agenteAna, confirmacao40: { ...(x.agenteAna?.confirmacao40 ?? { inicio }), inicio, enviadoEm: agora.toISOString(), idExterno: sent.idExterno, texto, ...(modelo ? { modelo } : {}) } },
          mensagens: [...x.mensagens, newMessage(texto, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada', ...(ctxSecretaria ? { automacaoKey: automacaoId } : {}), ...(modelo ? { modeloOficial: modelo } : {}) })],
          timeline: [...x.timeline, { data: agora.toISOString(), evento: 'Confirmação de presença enviada pela Anne' }],
        };
        // Com a secretaria ligada, a resposta do cliente fica associada a esta automação (até 1 h depois do início).
        return ctxSecretaria ? concluirEnvioRotina(enviada, { tipo: 'confirmacao_consulta', id: automacaoId, referencia: { inicio, eventoId }, expiraEm: new Date(Date.parse(inicio) + 3600000).toISOString(), idExterno: sent.idExterno, texto }, agora) : enviada;
      });
      resultado.enviados++;
    } catch (error) {
      // A reserva continua gravada: nunca reenviar automaticamente depois de falha ambígua.
      resultado.falhas++;
      console.error('Confirmação de presença não enviada', error);
      await atualizarConversa(db, row.id, x => registrarAviso(
        { ...x, agenteAna: { ...x.agenteAna, confirmacao40: { ...(x.agenteAna?.confirmacao40 ?? { inicio }), inicio, falhouEm: agora.toISOString() } } },
        { id: idAviso(inicio), tipo: 'confirmacao40', prioridade: true, criadoEm: agora.toISOString(), texto: `Confirmação de presença (consulta às ${hora(inicio)}) não confirmada pelo WhatsApp: conferir a conversa e confirmar por telefone. Não reenviar sem conferir.` },
      )).catch(() => undefined);
      await db.rpc('registrar_audit_log', { p_ator: 'Ana', p_perfil: 'sistema', p_acao: 'confirmacaoConsulta', p_resumo: 'Confirmação de presença não confirmada; equipe deve conferir', p_status: 'erro', p_erro: 'Envio da confirmação não confirmado.' });
    }
  }
  return resultado;
}

/** Aviso único por horário de consulta; janela perdida também vai para a auditoria. */
async function avisarEquipe(db: Db, id: string, inicio: string, motivo: MotivoAvisoConfirmacao, texto: string, agora: Date) {
  let criado = false;
  await atualizarConversa(db, id, x => {
    criado = false;
    const atual = x.agenteAna?.confirmacao40;
    if (x.consultaAgendada !== inicio || (atual?.inicio === inicio && (atual.reservadoEm || atual.avisadoEm))) return x;
    criado = true;
    return registrarAviso(
      { ...x, agenteAna: { ...x.agenteAna, confirmacao40: { inicio, avisadoEm: agora.toISOString() } } },
      { id: idAviso(inicio), tipo: 'confirmacao40', prioridade: true, criadoEm: agora.toISOString(), texto: textoAvisoConfirmacao(motivo, inicio), ...(motivo === 'controle_humano' ? { textoPronto: texto } : {}) },
    );
  });
  if (criado) await db.rpc('registrar_audit_log', { p_ator: 'Ana', p_perfil: 'sistema', p_acao: 'confirmacaoConsulta', p_resumo: textoAvisoConfirmacao(motivo, inicio).slice(0, 160), p_status: motivo === 'perdida' ? 'erro' : 'bloqueado' });
  return criado;
}
