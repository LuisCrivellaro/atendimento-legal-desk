// Relatório diário das 08:00 para a Dra. Carolina (pedido de 04/11/2026): resumo, por cliente, do que a Ana
// atendeu no dia anterior, separando quem a Dra. deve atender primeiro de quem só agendou consulta.
import type { Conversa } from '../mock-data';
import { dataAgenda, hora } from './ana-scheduling';

export const WHATSAPP_RELATORIO_DRA = '5511998290007';
export type GrupoRelatorio = 'prioridade' | 'agendamento' | 'andamento';
export interface ItemRelatorio { grupo: GrupoRelatorio; nome: string; telefone: string; detalhe: string }

/** Dia anterior no fuso de São Paulo (AAAA-MM-DD). */
export function diaAnterior(agora: Date) { return dataAgenda(new Date(agora.getTime() - 86400000).toISOString()); }

const daAna = (autor?: string) => !!autor && /^ana\b/i.test(autor.trim());

export function itemRelatorio(c: Conversa, dia: string): ItemRelatorio | undefined {
  const doDia = c.mensagens.filter(m => m.dataHora && dataAgenda(m.dataHora) === dia);
  if (!doDia.some(m => daAna(m.autor))) return undefined;
  const a = c.agenteAna;
  const nome = (a?.dados?.nome || c.nome || 'Sem nome').trim();
  const telefone = a?.telefone || '';
  const ultimaCliente = [...doDia].reverse().find(m => m.de === 'cliente')?.texto.replace(/\s+/g, ' ').slice(0, 140);
  const pendProcesso = (a?.pedidosProcesso ?? []).some(p => p.status === 'pendente');
  const motivos = [
    a?.urgente && 'urgente',
    a?.humano && 'pediu atendimento humano / transferido',
    pendProcesso && 'notícia de processo aguardando sua autorização',
    a?.vinculoProjuris && 'status' in a.vinculoProjuris && a.vinculoProjuris.status === 'pendente' && 'cadastro ProJuris a confirmar',
    a?.resultado?.encaminhar_humano && !a?.humano && 'dúvida para a equipe',
  ].filter(Boolean) as string[];
  if (motivos.length) return { grupo: 'prioridade', nome, telefone, detalhe: `${motivos.join('; ')}${ultimaCliente ? ` — "${ultimaCliente}"` : ''}` };
  const reserva = a?.reservaCalendar;
  if (reserva && c.consultaAgendada === reserva.inicio) {
    const d = dataAgenda(reserva.inicio);
    return { grupo: 'agendamento', nome, telefone, detalhe: `consulta ${d.slice(8, 10)}/${d.slice(5, 7)} às ${hora(reserva.inicio)}` };
  }
  return { grupo: 'andamento', nome, telefone, detalhe: a?.proximoPasso || 'conversa sem agendamento concluído' };
}

export function textoRelatorio(itens: ItemRelatorio[], dia: string) {
  const data = `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
  const secao = (titulo: string, g: GrupoRelatorio) => {
    const lista = itens.filter(i => i.grupo === g).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
    return `${titulo} (${lista.length})\n${lista.length ? lista.map((i, n) => `${n + 1}. ${i.nome}${i.telefone ? ` · ${i.telefone}` : ''}\n   ${i.detalhe}`).join('\n') : '—'}`;
  };
  return [
    `Bom dia, Dra. Carolina! Resumo dos atendimentos da Ana em ${data}: ${itens.length} cliente(s).`,
    secao('🔴 ATENDER PRIMEIRO', 'prioridade'),
    secao('🟢 SOMENTE AGENDAMENTO', 'agendamento'),
    secao('🟡 EM ANDAMENTO (sem agendamento)', 'andamento'),
  ].join('\n\n');
}
