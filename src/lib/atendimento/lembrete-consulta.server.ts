import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { OfficeState } from '../office';
import { defaultAutomations, newMessage } from '../atendimento';
import { consultaDeHoje } from './lembrete-consulta';
import { lerBiblioteca } from './biblioteca/renderizar';
import { politicaConsultaDia, textoLembreteDoDia } from './biblioteca/selecao';
import { bloqueadoPorTeste, lerConfigSecretaria } from './secretaria/config';
import { consultaSuspensa, situacaoConsulta } from './situacao-consulta';
import { atualizarConversa } from './ana.server';
import { hora } from './ana-scheduling';
import { registrarAviso } from './avisos-equipe';
import { secretariaLigada } from './secretaria/secretaria.server';
import { concluirEnvioRotina, contextoRotina, decidirLembreteSecretaria, motorPermiteRotina, reservarEnvioRotina } from './secretaria/rotinas';

/**
 * Envia o lembrete do dia às consultas com recibo real do Calendar, uma única vez por consulta.
 * A resposta NÃO fica autorizada como cancelamento só depois do envio confirmado (consentimento ligado ao recibo e ao contato).
 */
export async function enviarLembretesConsulta(db: SupabaseClient<Database>, agora = new Date()) {
  const cfg = await db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id', true).single();
  if (cfg.error) throw new Error('Configuração indisponível.');
  if (cfg.data.canal_ativo !== 'ultramsg' || !cfg.data.agente_ativo) return { enviados: 0, motivo: 'canal ou Ana desligados' };
  const contatos = await db.from('atendimento_contatos_teste').select('conversa_id,contato_externo').eq('canal', 'ultramsg').eq('status', 'liberado');
  if (contatos.error) throw new Error('Contatos indisponíveis.');
  const porConversa = new Map((contatos.data ?? []).filter(c => c.conversa_id).map(c => [c.conversa_id as string, c.contato_externo]));
  if (!porConversa.size) return { enviados: 0 };
  const rows = await db.from('casos').select('id,owner_id,dados').in('id', [...porConversa.keys()]);
  if (rows.error) throw new Error('Conversas indisponíveis.');
  const { enviarMensagemSistema } = await import('./envio.functions');
  // Secretaria digital: só é consultada quando a área de trabalho do dono a liga (falha de leitura = fluxo anterior).
  const donos = [...new Set(rows.data.map(r => r.owner_id))];
  const ws = await db.from('office_workspace').select('owner_id,dados').in('owner_id', donos);
  const estados = new Map<string, OfficeState>(ws.error ? [] : (ws.data ?? []).map(w => [w.owner_id, w.dados as unknown as OfficeState]));
  let enviados = 0, falhas = 0, bloqueados = 0;
  for (const row of rows.data) {
    const c = row.dados as unknown as Conversa;
    const reserva = c.agenteAna?.reservaCalendar;
    if (!reserva || reserva.inicio !== c.consultaAgendada || !consultaDeHoje(c.consultaAgendada, agora)) continue;
    if (c.agenteAna?.lembreteConsulta?.inicio === reserva.inicio) continue;
    // O monitor roda a cada 5 min (8h–12h): consulta que já começou ou começa em menos de 30 min não recebe lembrete
    // (ex.: rotina parada e retomada tarde) — nunca "sua consulta está confirmada para hoje" depois do horário.
    if (Date.parse(reserva.inicio) - agora.getTime() < 30 * 60000) continue;
    const contato = porConversa.get(row.id);
    const state = estados.get(row.owner_id);
    const ctxSecretaria = secretariaLigada(state) ? contextoRotina({ state, agenteAtivo: cfg.data.agente_ativo === true, canalAtivo: cfg.data.canal_ativo === 'ultramsg', contato, modoPadrao: state?.automations?.modoIA ?? defaultAutomations.modoIA }) : undefined;
    if (!ctxSecretaria && (c.agenteAna?.humano || c.agenteAna?.pausa)) continue;
    if (!contato) continue;
    // Modo de teste controlado: só o número autorizado recebe. Consulta já cancelada/realizada nunca recebe lembrete.
    if (bloqueadoPorTeste(lerConfigSecretaria((state as { secretaria?: unknown } | undefined)?.secretaria), contato)) { bloqueados++; continue; }
    if (['cancelada', 'realizada', 'ausente'].includes(situacaoConsulta(c).estado) || consultaSuspensa(c)) continue;
    // Biblioteca oficial: modelo 01, só com nome do cadastro, de manhã ("Bom dia") e sem lembrete/confirmação redundante.
    const politica = politicaConsultaDia(c, reserva.inicio, 'lembrete', agora);
    if (!politica.permitido) continue;
    const oficial = textoLembreteDoDia(c, reserva.inicio, agora, lerBiblioteca((state as { bibliotecaMensagens?: unknown } | undefined)?.bibliotecaMensagens));
    if (!oficial.ok) {
      const motivo = oficial.detalhe ?? (oficial.faltando?.length ? `faltam ${oficial.faltando.join(', ')}` : `modelo ${oficial.id} ${oficial.motivo}`);
      await atualizarConversa(db, row.id, x => registrarAviso(x, { id: `lembrete-consulta:${reserva.inicio}`, tipo: 'confirmacao40', criadoEm: agora.toISOString(), texto: `Lembrete do dia (consulta às ${hora(reserva.inicio)}) não enviado: ${motivo}. Nenhum texto foi improvisado.`.slice(0, 300) }));
      continue;
    }
    const texto = oficial.texto;
    const modelo = { id: oficial.id, versao: oficial.versao };
    const automacaoId = `lembrete_consulta:${reserva.inicio}`;
    if (ctxSecretaria) {
      // Híbrido envia; Humano, Bloqueado, pausa ou equipe escrevendo agora viram aviso com texto pronto (uma vez por consulta).
      const d = decidirLembreteSecretaria(c, ctxSecretaria, agora);
      if (d.tipo === 'ignorar') continue;
      if (d.tipo === 'aviso') {
        await atualizarConversa(db, row.id, x => registrarAviso(x, { id: `lembrete-consulta:${reserva.inicio}`, tipo: 'confirmacao40', criadoEm: agora.toISOString(), texto: `Lembrete do dia (consulta às ${hora(reserva.inicio)}) não enviado pela Anne: ${d.motivo} Texto pronto para enviar.`.slice(0, 300), textoPronto: texto }));
        continue;
      }
    }
    // Reserva o lembrete antes da chamada externa: nunca reenviado automaticamente, mesmo após falha ambígua.
    let reservado = false;
    await atualizarConversa(db, row.id, x => {
      reservado = false;
      if (x.agenteAna?.lembreteConsulta?.inicio === reserva.inicio || x.consultaAgendada !== reserva.inicio) return x;
      if (ctxSecretaria && !motorPermiteRotina(x, ctxSecretaria, 'lembrete_consulta', agora)) return x;
      reservado = true;
      const comReserva = { ...x, agenteAna: { ...x.agenteAna, lembreteConsulta: { inicio: reserva.inicio, enviadoEm: agora.toISOString() }, envioAna: { mensagemId: `lembrete:${reserva.id}`, texto, desde: agora.toISOString() } } };
      return ctxSecretaria ? reservarEnvioRotina(comReserva, automacaoId, texto, agora) : comReserva;
    });
    if (!reservado) continue;
    try {
      const sent = await enviarMensagemSistema({ supabase: db, conversaId: row.id, texto, motivo: 'lembrete', contatoEsperado: contato, ...(ctxSecretaria ? { automacaoId } : {}) });
      if (sent.simulado) throw new Error('Canal desligado.');
      // O modelo oficial 01 não pede SIM/NÃO: nenhum consentimento de cancelamento é gravado; um "não" do cliente
      // segue o fluxo de cancelamento com pergunta e confirmação explícitas.
      await atualizarConversa(db, row.id, x => {
        const enviada: Conversa = {
          ...x,
          mensagens: [...x.mensagens, newMessage(texto, { autor: 'Ana · assistente virtual', canal: 'ultramsg', idExterno: sent.idExterno, status: 'enviada', modeloOficial: modelo, ...(ctxSecretaria ? { automacaoKey: automacaoId } : {}) })],
          timeline: [...x.timeline, { data: agora.toISOString(), evento: 'Lembrete do dia da consulta enviado pela Ana' }],
        };
        // Com a secretaria ligada, o SIM/NÃO fica associado a esta automação até o início da consulta.
        return ctxSecretaria ? concluirEnvioRotina(enviada, { tipo: 'lembrete_consulta', id: automacaoId, referencia: { inicio: reserva.inicio, eventoId: reserva.id }, expiraEm: reserva.inicio, idExterno: sent.idExterno, texto }, agora) : enviada;
      });
      enviados++;
    } catch (error) {
      falhas++;
      console.error('Lembrete de consulta não enviado', error);
      await db.rpc('registrar_audit_log', { p_ator: 'Ana', p_perfil: 'sistema', p_acao: 'lembreteConsulta', p_resumo: 'Lembrete do dia não confirmado; equipe deve conferir', p_status: 'erro', p_erro: 'Envio do lembrete não confirmado.' });
    }
  }
  return { enviados, falhas, ...(bloqueados ? { bloqueados, motivo: 'modo de teste' } : {}) };
}
