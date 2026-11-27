import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { newMessage } from '../atendimento';
import { mensagemEncaminhamento, registrarAvisoEncaminhamento, registrarEncaminhamento, type DadosEncaminhamento } from './encaminhamento-advogado';

type Db = SupabaseClient<Database>;

export interface EntradaEncaminhamento {
  conversaId: string;
  messageId: string;
  canal: 'ultramsg' | 'telegram';
  contato: string;
  controleHumanoEm: string | undefined;
  dados: Pick<DadosEncaminhamento, 'texto' | 'responsavel' | 'nomeCliente' | 'telefone' | 'processo'>;
  /** Primeiro nome verificado para a mensagem fixa; sem ele, só "Olá,". */
  nomeSaudacao: string | undefined;
  /** "fora_horario": o modelo 03 já respondeu; só registra a pendência. */
  aviso: 'enviando' | 'fora_horario';
  /** Marca a mensagem em processamento como "enviando" antes do canal (recuperação nunca reenvia). */
  marcarEfeito: () => Promise<unknown>;
  /** Cliente ativo com cadastro único no ProJuris: grava a carteira "cadastrado", como o fluxo normal. */
  cadastrado?: boolean;
}

/**
 * Pendência para o advogado + mensagem fixa ao cliente (sem modelo). Uma reserva de envio por vez: quem abriu ou
 * reabriu o aviso envia; se uma mensagem nova do mesmo cliente chegou antes do envio, o aviso sai por ela (uma
 * resposta só, sem duplicar). Bloqueio por controle humano ou mudança de modo: aviso "nao_enviado", a pendência fica.
 */
export async function encaminharAoAdvogado(db: Db, p: EntradaEncaminhamento): Promise<{ enviado: boolean; novo: boolean }> {
  const { atualizarConversa } = await import('./ana.server');
  let reg: ReturnType<typeof registrarEncaminhamento> | undefined;
  await atualizarConversa(db, p.conversaId, x => {
    reg = registrarEncaminhamento(x, { ...p.dados, conversaId: p.conversaId, mensagemId: p.messageId, aviso: p.aviso }, p.canal);
    return p.cadastrado ? { ...reg.conversa, tipoClienteAgenda: 'cadastrado' as const } : reg.conversa;
  });
  const r = reg;
  if (!r) throw new Error('Pendência do advogado não registrada.');
  const concluir = (ids: string[], extra: (x: Conversa) => Conversa = x => x) => atualizarConversa(db, p.conversaId, x => extra({ ...x, mensagens: x.mensagens.map(m => ids.includes(m.id) && m.iaExecucao ? { ...m, iaExecucao: { ...m.iaExecucao, estado: 'concluida' as const } } : m) }));
  const auditar = (resumo: string, status: 'sucesso' | 'erro' | 'bloqueado' = 'sucesso') => db.rpc('registrar_audit_log', { p_ator: 'Anne', p_perfil: 'sistema', p_acao: 'encaminhamentoAdvogado', p_resumo: resumo.slice(0, 300), p_status: status });
  if (r.novo) await auditar(`Cliente ativo encaminhado a ${p.dados.responsavel} (aguardando atendimento)${p.aviso === 'fora_horario' ? ' · modelo fora do horário já enviado' : ''}`);
  if (!r.enviar) { await concluir([p.messageId]); return { enviado: false, novo: r.novo }; }
  const texto = mensagemEncaminhamento(p.nomeSaudacao);
  const { enviarMensagemSistema } = await import('./envio.functions');
  const encId = r.encaminhamento.id;
  let origem = p.messageId;
  await p.marcarEfeito();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const sent = await enviarMensagemSistema({ supabase: db, conversaId: p.conversaId, texto, motivo: 'ana', contatoEsperado: p.contato, mensagemOrigem: origem, controleHumanoEm: p.controleHumanoEm });
      if (sent.simulado) {
        await concluir([p.messageId], x => registrarAvisoEncaminhamento(x, encId, p.messageId, 'nao_enviado'));
        await auditar('Mensagem fixa do encaminhamento não enviada: canal desligado.', 'bloqueado');
        return { enviado: false, novo: r.novo };
      }
      await concluir([p.messageId, origem], x => ({
        ...registrarAvisoEncaminhamento(x, encId, p.messageId, 'enviado', { idExterno: sent.idExterno, mensagemId: origem }),
        agenteAna: { ...x.agenteAna, envioAna: undefined },
        mensagens: [...x.mensagens, newMessage(texto, { autor: 'Ana · assistente virtual', canal: p.canal, idExterno: sent.idExterno, respostaAnaDe: origem, status: 'enviada' })],
      }));
      await auditar(`Mensagem fixa do encaminhamento enviada (responsável: ${p.dados.responsavel}).`);
      return { enviado: true, novo: r.novo };
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ana_envio_bloqueado') {
        // Falha do canal depois de autorizado: pode ter saído; nunca reenviar sozinho (a pendência continua na fila).
        await atualizarConversa(db, p.conversaId, x => registrarAvisoEncaminhamento(x, encId, p.messageId, 'incerto')).catch(() => undefined);
        throw error;
      }
      // Bloqueado antes de sair. Mensagem nova do mesmo cliente (sem equipe no meio): o aviso sai por ela.
      const fresh = await db.from('casos').select('dados').eq('id', p.conversaId).single();
      const c = fresh.data?.dados as unknown as Conversa | undefined;
      const ultima = c?.mensagens.at(-1);
      const livre = !!c && !!ultima && ultima.de === 'cliente' && ultima.id !== origem && ultima.id.startsWith(`${p.canal}:${p.contato}:`)
        && !c.agenteAna?.humano && !c.agenteAna?.pausa && c.agenteAna?.controleHumanoEm === p.controleHumanoEm
        && !c.mensagens.some(m => m.respostaAnaDe === ultima.id);
      if (!livre || !ultima) {
        await concluir([p.messageId], x => registrarAvisoEncaminhamento(x, encId, p.messageId, 'nao_enviado'));
        return { enviado: false, novo: r.novo };
      }
      origem = ultima.id;
    }
  }
  await concluir([p.messageId], x => registrarAvisoEncaminhamento(x, encId, p.messageId, 'nao_enviado'));
  return { enviado: false, novo: r.novo };
}
