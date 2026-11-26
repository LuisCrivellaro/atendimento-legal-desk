import type { Conversa } from '../mock-data';
import { IDS_TEMPLATES, TEMPLATES_OFICIAIS, type IdTemplate } from './biblioteca/mensagens-oficiais';
import type { BibliotecaSalva } from './biblioteca/renderizar';
import { instanteEvento } from './eventos-processuais';

/**
 * Resumo do Atendimento para o painel de Automações (só leitura, conta do dono): audiências e perícias futuras,
 * aprovações jurídicas pendentes, documentos pendentes e modelos oficiais aguardando a Dra. Sem dado sensível além
 * do nome da conversa que o próprio dono já vê.
 */
export interface ResumoPainel {
  eventos: { conversaId: string; nome: string; tipo: 'audiencia' | 'pericia'; data: string; hora: string; estado: string }[];
  aprovacoesPendentes: number;
  documentosPendentes: { conversas: number; itens: number };
  modelosAguardando: { id: IdTemplate; titulo: string }[];
}

export function resumoPainel(casos: { id: string; nome: string; dados: Conversa }[], biblioteca: BibliotecaSalva | undefined, agora = new Date()): ResumoPainel {
  const eventos: ResumoPainel['eventos'] = [];
  let aprovacoesPendentes = 0, conversasDocs = 0, itensDocs = 0;
  for (const { id, nome, dados: c } of casos) {
    for (const e of c.agenteAna?.eventosProcessuais ?? []) {
      const quando = instanteEvento(e);
      if ((e.estado === 'comunicado' || e.estado === 'rascunho') && (quando === undefined || quando > agora.getTime())) {
        eventos.push({ conversaId: id, nome, tipo: e.tipo, data: e.data ?? 'data a confirmar', hora: e.hora ?? '', estado: e.estado === 'comunicado' ? 'comunicado ao cliente' : 'aguardando aprovação' });
      }
    }
    aprovacoesPendentes += (c.agenteAna?.pedidosProcesso ?? []).filter(p => p.status === 'pendente').length;
    if (c.etapa === 'documentos' || c.contrato === 'assinado') {
      const faltam = (c.documentos ?? []).filter(d => !d.recebido).length;
      if (faltam) { conversasDocs++; itensDocs += faltam; }
    }
  }
  eventos.sort((a, b) => (instanteEvento({ data: a.data, hora: a.hora }) ?? Infinity) - (instanteEvento({ data: b.data, hora: b.hora }) ?? Infinity));
  const modelosAguardando = IDS_TEMPLATES.filter(id => (biblioteca?.ativacao?.[id] ?? TEMPLATES_OFICIAIS[id].ativacao) === 'aguardando_aprovacao').map(id => ({ id, titulo: TEMPLATES_OFICIAIS[id].titulo }));
  return { eventos: eventos.slice(0, 20), aprovacoesPendentes, documentosPendentes: { conversas: conversasDocs, itens: itensDocs }, modelosAguardando };
}
