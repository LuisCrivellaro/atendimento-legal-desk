import type { Conversa } from '../mock-data';
import type { CompromissoPJ } from '../projuris/agenda';
import { PREFIXO_EXTERNO_MANAGER } from '../projuris/agenda';
import { chaveTelefone } from './telefone';
import { dataOficial, horarioOficial } from './biblioteca/selecao';

/**
 * Sincronização da agenda oficial (ProJuris) com as conversas, sem modelo e sem inventar recibos:
 * - consulta marcada pela equipe direto no ProJuris é vinculada à conversa só com vínculo inequívoco: telefone do
 *   cliente no título/descrição do compromisso, ou nome completo do cadastro com vínculo confirmado — e um único
 *   cliente possível; mais de um candidato, ou cliente com outra consulta marcada, vira pendência para a equipe;
 * - horário alterado no ProJuris atualiza a consulta da conversa (lembretes e confirmação seguem o novo horário);
 * - compromisso que sumiu da listagem é conferido pelo código oficial antes de qualquer cancelamento.
 */

export interface ConversaAgenda {
  id: string;
  conversa: Conversa;
  /** Contato de WhatsApp liberado e vinculado à conversa. */
  contato?: string | undefined;
}

export type AcaoAgenda =
  | { tipo: 'vincular'; conversaId: string; compromisso: CompromissoPJ; evidencia: 'telefone' | 'nome do cadastro' }
  | { tipo: 'atualizar_horario'; conversaId: string; compromisso: CompromissoPJ }
  | { tipo: 'verificar_cancelamento'; conversaId: string; codigo: number }
  /** Compromisso voltou a aparecer ativo: a suspensão por conferência da agenda deixa de valer. */
  | { tipo: 'retomar'; conversaId: string; compromisso: CompromissoPJ }
  | { tipo: 'pendencia'; compromisso: CompromissoPJ; motivo: string; conversaId?: string | undefined; reconciliacao?: boolean };

/** Motivo da pendência de reconciliação (reserva do Manager ADV no ProJuris sem consulta correspondente na conversa). */
export const MOTIVO_RESERVA_ORFA = 'reserva da Anne ativa no ProJuris sem consulta correspondente na conversa (gravação local falhou ou duplicidade): confirmar com o cliente ou concluir o compromisso no ProJuris';

/** Conversa de origem de um compromisso criado pelo Manager ADV (`manageradv:consulta:<conversa>:<inicioMs>`). */
export function conversaDoCodigoExterno(codigoExterno: string | undefined): { conversaId: string; inicioMs: number } | undefined {
  const m = /^manageradv:consulta:([^:]+):(\d+)$/.exec(codigoExterno ?? '');
  return m ? { conversaId: m[1]!, inicioMs: Number(m[2]) } : undefined;
}

/** Janela olhada pelo monitor: de 2 h atrás até 15 dias à frente. */
export const JANELA_SINCRONIZACAO = { antesMs: 2 * 3600000, depoisMs: 15 * 86400000 } as const;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Telefones brasileiros escritos no texto (chave DDD + 8 últimos dígitos). */
export function telefonesNoTexto(texto: string): string[] {
  const achados = [...texto.matchAll(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}/g)].map(m => m[0].replace(/\D/g, ''));
  return [...new Set(achados.filter(d => d.length >= 10 && d.length <= 13).map(chaveTelefone))];
}

/** Código oficial do recibo `pj:<codigo>`. */
export function codigoDaReserva(id: string | undefined): number | undefined {
  const m = /^pj:(\d+)$/.exec(id ?? '');
  return m ? Number(m[1]) : undefined;
}

export function planejarSincronizacao(compromissos: CompromissoPJ[], conversas: ConversaAgenda[], agora = new Date()): AcaoAgenda[] {
  const acoes: AcaoAgenda[] = [];
  const ini = agora.getTime() - JANELA_SINCRONIZACAO.antesMs, fim = agora.getTime() + JANELA_SINCRONIZACAO.depoisMs;
  const porCodigo = new Map(compromissos.map(c => [c.codigo, c]));
  const vinculados = new Set<number>();

  // 1. Consultas já vinculadas: horário alterado ou compromisso que sumiu da listagem.
  for (const item of conversas) {
    const r = item.conversa.agenteAna?.reservaCalendar;
    const codigo = codigoDaReserva(r?.id);
    if (!r || codigo === undefined) continue;
    vinculados.add(codigo);
    const inicio = Date.parse(r.inicio);
    if (!Number.isFinite(inicio) || inicio < ini || inicio > fim || item.conversa.consultaAgendada !== r.inicio) continue;
    const c = porCodigo.get(codigo);
    const suspensa = item.conversa.agenteAna?.consultaSuspensa?.inicio === r.inicio;
    if (!c) { if (!suspensa) acoes.push({ tipo: 'verificar_cancelamento', conversaId: item.id, codigo }); }
    else if (c.inicioMs !== inicio || c.fimMs !== Date.parse(r.fim)) acoes.push({ tipo: 'atualizar_horario', conversaId: item.id, compromisso: c });
    else if (suspensa) acoes.push({ tipo: 'retomar', conversaId: item.id, compromisso: c });
  }

  // 2. Compromissos marcados direto no ProJuris (sem codigoExterno do Manager ADV) ainda sem conversa.
  const porTelefone = new Map<string, string[]>();
  for (const item of conversas) {
    if (!item.contato) continue;
    const k = chaveTelefone(item.contato);
    porTelefone.set(k, [...(porTelefone.get(k) ?? []), item.id]);
  }
  const nomes = conversas.flatMap(item => {
    const v = item.conversa.agenteAna?.vinculoProjuris;
    const nome = v?.status === 'confirmado' ? fold(v.nome) : '';
    return nome.split(' ').length >= 2 ? [{ id: item.id, nome }] : [];
  });
  for (const c of compromissos) {
    if (vinculados.has(c.codigo) || c.concluido || c.inicioMs <= agora.getTime() || c.inicioMs > fim) continue;
    if (c.codigoExterno?.startsWith(PREFIXO_EXTERNO_MANAGER)) {
      // Reconciliação: reserva criada pela Anne (identificador estruturado da conversa) sem recibo local. Nunca vincula
      // sozinha — o cliente pode ter recebido "não consegui concluir a reserva" —, vira pendência para a equipe.
      const origem = conversaDoCodigoExterno(c.codigoExterno);
      const item = origem ? conversas.find(x => x.id === origem.conversaId) : undefined;
      if (!item) continue;
      const reserva = item.conversa.agenteAna?.reservaCalendar;
      if (reserva?.pendenteProjuris?.codigoExterno === c.codigoExterno) continue; // lançamento da reserva provisória em curso
      if (item.conversa.consultaAgendada && Date.parse(item.conversa.consultaAgendada) === c.inicioMs && reserva && codigoDaReserva(reserva.id) === undefined) continue;
      acoes.push({ tipo: 'pendencia', compromisso: c, conversaId: item.id, motivo: MOTIVO_RESERVA_ORFA, reconciliacao: true });
      continue;
    }
    const texto = `${c.titulo} ${c.descricao ?? ''}`;
    const porFone = new Set(telefonesNoTexto(texto).flatMap(k => porTelefone.get(k) ?? []));
    const t = fold(texto);
    const porNome = new Set(nomes.filter(n => t.includes(n.nome)).map(n => n.id));
    const candidatos = new Set([...porFone, ...porNome]);
    if (candidatos.size === 0) continue;
    if (candidatos.size > 1) { acoes.push({ tipo: 'pendencia', compromisso: c, motivo: 'mais de um cliente possível para o compromisso' }); continue; }
    const conversaId = [...candidatos][0]!;
    const conversa = conversas.find(x => x.id === conversaId)!.conversa;
    const atual = conversa.consultaAgendada;
    if (atual && Date.parse(atual) > agora.getTime() && Date.parse(atual) !== c.inicioMs) {
      acoes.push({ tipo: 'pendencia', compromisso: c, conversaId, motivo: 'cliente já tem outra consulta marcada' });
      continue;
    }
    if (atual && Date.parse(atual) === c.inicioMs && conversa.agenteAna?.reservaCalendar && codigoDaReserva(conversa.agenteAna.reservaCalendar.id) !== c.codigo) continue;
    acoes.push({ tipo: 'vincular', conversaId, compromisso: c, evidencia: porFone.size ? 'telefone' : 'nome do cadastro' });
  }
  return acoes;
}

/** Aplica o vínculo na conversa (recibo oficial = código do compromisso + horários lidos da agenda). */
export function aplicarVinculo<T extends Conversa>(x: T, c: CompromissoPJ, evidencia: string, agora = new Date()): T {
  const inicio = new Date(c.inicioMs).toISOString(), fim = new Date(c.fimMs > c.inicioMs ? c.fimMs : c.inicioMs + 30 * 60000).toISOString();
  return {
    ...x,
    consultaAgendada: inicio,
    agenteAna: { ...x.agenteAna, reservaCalendar: { id: `pj:${c.codigo}`, inicio, fim, origem: 'projuris_sincronizado' } },
    timeline: [...(x.timeline ?? []), { data: agora.toISOString(), evento: `Consulta marcada no ProJuris pela equipe (${dataOficial(inicio)} às ${horarioOficial(inicio)}) reconhecida por ${evidencia}: lembrete e confirmação habilitados.` }],
  };
}

/** Horário alterado no ProJuris: a conversa passa a seguir o horário oficial. */
export function aplicarNovoHorario<T extends Conversa>(x: T, c: CompromissoPJ, agora = new Date()): T {
  const r = x.agenteAna?.reservaCalendar;
  if (!r) return x;
  const inicio = new Date(c.inicioMs).toISOString(), fim = new Date(c.fimMs > c.inicioMs ? c.fimMs : c.inicioMs + 30 * 60000).toISOString();
  return {
    ...x,
    consultaAgendada: inicio,
    agenteAna: { ...x.agenteAna, reservaCalendar: { ...r, inicio, fim } },
    timeline: [...(x.timeline ?? []), { data: agora.toISOString(), evento: `Horário da consulta alterado no ProJuris: agora ${dataOficial(inicio)} às ${horarioOficial(inicio)}.` }],
  };
}
