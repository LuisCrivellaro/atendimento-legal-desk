import type { Conversa } from '../mock-data';
import type { ConfigSecretaria } from './secretaria/config';
import { politicaConsultaDia, textoLembreteDoDia } from './biblioteca/selecao';
import { situacaoConsulta } from './situacao-consulta';
import { origemMensagem } from './secretaria/origem';

/**
 * Mensagens programadas da conta (próximas 36 h) para o painel de Automações, calculadas com as MESMAS regras das
 * rotinas (recibo da agenda, política anti-redundância, nome do cadastro, "Bom dia" só de manhã). Só leitura.
 */

export interface MensagemProgramadaPainel {
  conversaId: string;
  nome: string;
  tipo: 'lembrete' | 'confirmacao';
  quando: string;
  estado: 'prevista' | 'enviada' | 'nao_sai';
  motivo?: string | undefined;
}

function diaSP(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function programadasDaConta(casos: { id: string; nome: string; dados: Conversa }[], config: ConfigSecretaria, agora = new Date()) {
  const programadas: MensagemProgramadaPainel[] = [];
  let enviadasHoje = 0;
  const hoje = diaSP(agora);
  for (const { id, nome, dados: c } of casos) {
    for (const m of c.mensagens ?? []) if (m.de === 'escritorio' && origemMensagem(m) === 'automacao' && m.dataHora && diaSP(new Date(m.dataHora)) === hoje) enviadasHoje++;
    const inicio = c.consultaAgendada;
    if (!inicio) continue;
    const t = Date.parse(inicio);
    if (!Number.isFinite(t) || t < agora.getTime() || t > agora.getTime() + 36 * 3600000) continue;
    const situacao = situacaoConsulta(c).estado;
    if (situacao === 'cancelada' || situacao === 'realizada' || situacao === 'ausente') continue;
    const semRecibo = c.agenteAna?.reservaCalendar?.inicio !== inicio ? 'sem recibo da agenda oficial' : undefined;
    // Lembrete das 08h do dia da consulta.
    const oito = new Date(`${diaSP(new Date(t))}T08:00:00-03:00`);
    const lembrete = c.agenteAna?.lembreteConsulta?.inicio === inicio;
    if (lembrete) programadas.push({ conversaId: id, nome, tipo: 'lembrete', quando: c.agenteAna?.lembreteConsulta?.enviadoEm ?? oito.toISOString(), estado: 'enviada' });
    else if (oito.getTime() < t) {
      const quando = oito.getTime() < agora.getTime() ? agora : oito;
      const meioDia = new Date(`${diaSP(new Date(t))}T12:00:00-03:00`);
      const foraJanela = quando.getTime() >= meioDia.getTime() || t - quando.getTime() < 30 * 60000;
      const pol = politicaConsultaDia(c, inicio, 'lembrete', quando);
      const texto = textoLembreteDoDia(c, inicio, quando);
      const motivo = semRecibo ?? (foraJanela ? 'fora da janela do lembrete (8h–12h e até 30 min antes)' : !pol.permitido ? pol.motivo : !texto.ok ? (texto.detalhe ?? (texto.faltando?.length ? `falta ${texto.faltando.join(', ')}` : 'modelo indisponível')) : undefined);
      programadas.push({ conversaId: id, nome, tipo: 'lembrete', quando: quando.toISOString(), estado: motivo ? 'nao_sai' : 'prevista', ...(motivo ? { motivo } : {}) });
    }
    // Confirmação de presença (antecedência configurada).
    const c40 = c.agenteAna?.confirmacao40;
    if (c40?.inicio === inicio && (c40.enviadoEm || c40.reservadoEm)) programadas.push({ conversaId: id, nome, tipo: 'confirmacao', quando: c40.enviadoEm ?? c40.reservadoEm ?? inicio, estado: 'enviada' });
    else {
      const previsto = new Date(t - config.confirmacaoAntecedenciaMin * 60000);
      const quando = previsto.getTime() < agora.getTime() ? agora : previsto;
      const pol = politicaConsultaDia(c, inicio, 'confirmacao', quando);
      const motivo = semRecibo ?? (c40?.inicio === inicio && c40.avisadoEm ? 'virou aviso para a equipe' : !pol.permitido ? pol.motivo : undefined);
      programadas.push({ conversaId: id, nome, tipo: 'confirmacao', quando: quando.toISOString(), estado: motivo ? 'nao_sai' : 'prevista', ...(motivo ? { motivo } : {}) });
    }
  }
  programadas.sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
  return { programadas: programadas.slice(0, 60), enviadasHoje };
}
