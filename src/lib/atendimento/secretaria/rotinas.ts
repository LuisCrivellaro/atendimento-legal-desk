import type { Conversa } from '../../mock-data';
import type { AIMode } from '../../atendimento';
import { decidirConfirmacao40, type DecisaoConfirmacao, type EntradaConfirmacao } from '../confirmacao-consulta';
import { lerConfigSecretaria, type ConfigSecretaria, type Funcionalidade } from './config';
import { decisaoRotina, registrarAutomacaoEnviada, type ContextoOperacional } from './operacional';
import type { AmbienteMotor } from './motor';
import { lerBiblioteca } from '../biblioteca/renderizar';

/**
 * Rotinas do servidor (confirmação 40 min, lembrete 08:00) com a secretaria ligada.
 * O horário, a deduplicação, o recibo e o vínculo continuam com as regras puras existentes;
 * o que muda é quem decide se a mensagem pode sair: o motor (modo da conversa, permissões, prioridade humana).
 * No modo Híbrido a automação sai; Humano/Bloqueado/aprovação viram aviso com texto pronto para a equipe.
 */

export function contextoRotina(dados: { state: unknown; agenteAtivo: boolean; canalAtivo: boolean; contato: string | undefined; modoPadrao: AIMode; config?: ConfigSecretaria }): ContextoOperacional {
  const state = dados.state as { secretaria?: unknown; anaPausa?: { ativa?: boolean }; bibliotecaMensagens?: unknown } | undefined;
  const ambiente: AmbienteMotor = { agenteAtivo: dados.agenteAtivo, canalAtivo: dados.canalAtivo, iaPausada: !!state?.anaPausa?.ativa };
  return { config: dados.config ?? lerConfigSecretaria(state?.secretaria), ativa: true, ambiente, contato: dados.contato, modoPadrao: dados.modoPadrao, canal: 'ultramsg', biblioteca: lerBiblioteca(state?.bibliotecaMensagens) };
}

/** Confirmação de 40 min decidida pelo motor. Mantém o formato de decisão da rotina existente. */
export function decidirConfirmacaoSecretaria(c: Conversa, entrada: EntradaConfirmacao, ctx: ContextoOperacional, agora = new Date()): DecisaoConfirmacao {
  // As regras de janela, recibo e vínculo seguem iguais; modo e pausas passam a ser do motor.
  const base = decidirConfirmacao40({ ...entrada, humano: false, pausa: false, modo: 'Automática' }, agora);
  if (base.tipo !== 'enviar') return base;
  const d = decisaoRotina(c, ctx, 'confirmacao_consulta', { agora, urgente: true, dadosVerificados: true });
  if (d.resultado === 'executar') return base;
  if (d.avisarEquipe) return { tipo: 'aviso', inicio: base.inicio, motivo: 'controle_humano', texto: base.texto };
  return { tipo: 'ignorar', motivo: d.texto };
}

/** Reconferência dentro da escrita CAS (o estado pode ter mudado desde a leitura). */
export function motorPermiteRotina(c: Conversa, ctx: ContextoOperacional, funcionalidade: Funcionalidade, agora = new Date()) {
  return decisaoRotina(c, ctx, funcionalidade, { agora, urgente: true, dadosVerificados: true }).resultado === 'executar';
}

/** Lembrete das 08:00 decidido pelo motor: executar, avisar a equipe (texto pronto) ou pular. */
export function decidirLembreteSecretaria(c: Conversa, ctx: ContextoOperacional, agora = new Date()): { tipo: 'enviar' } | { tipo: 'aviso'; motivo: string } | { tipo: 'ignorar'; motivo: string } {
  // Lembrete roda uma vez por dia: nunca "adiar" (sumiria); prioridade humana vira aviso.
  const d = decisaoRotina(c, ctx, 'lembrete_consulta', { agora, urgente: true, dadosVerificados: true });
  if (d.resultado === 'executar') return { tipo: 'enviar' };
  if (d.avisarEquipe) return { tipo: 'aviso', motivo: d.texto };
  return { tipo: 'ignorar', motivo: d.texto };
}

/** Reserva do envio de uma rotina (conferida na camada de envio e usada no reconhecimento do eco). */
export function reservarEnvioRotina(c: Conversa, automacaoId: string, texto: string, agora = new Date()): Conversa {
  const desde = agora.toISOString();
  const controleHumanoEm = c.agenteAna?.controleHumanoEm;
  return { ...c, agenteAna: { ...c.agenteAna, envioAna: { mensagemId: `automacao:${automacaoId}`, texto, desde }, secretaria: { ...c.agenteAna?.secretaria, envio: { automacaoId, texto, desde, ...(controleHumanoEm ? { controleHumanoEm } : {}) } } } };
}

/** Depois do recibo do canal: registra a automação aguardando resposta e libera a reserva. */
export function concluirEnvioRotina(c: Conversa, dados: Parameters<typeof registrarAutomacaoEnviada>[1], agora = new Date()): Conversa {
  const comAutomacao = registrarAutomacaoEnviada(c, dados, agora);
  const s = comAutomacao.agenteAna?.secretaria;
  return { ...comAutomacao, agenteAna: { ...comAutomacao.agenteAna, secretaria: { ...s, envio: s?.envio?.automacaoId === dados.id ? undefined : s?.envio } } };
}
