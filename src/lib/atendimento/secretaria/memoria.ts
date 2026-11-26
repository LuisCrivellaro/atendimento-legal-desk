import type { Conversa } from '../../mock-data';
import { formatarHorarioCliente } from '../../atendimento';
import { automacoesAtivas, ROTULOS_ESTADO, ROTULOS_TIPO } from './automacoes';

/**
 * Memória estruturada da conversa, montada só com dados desta conversa (nunca de outro cliente) e com a
 * confiabilidade de cada item explícita:
 * - verificado: fonte oficial ou recibo (agenda com recibo, vínculo confirmado, checklist real, cadastro);
 * - declarado: informado pelo cliente, sem conferência;
 * - inferido: classificação da IA ou regra heurística (nunca afirmado ao cliente como fato);
 * - desatualizado: valia antes (ex.: horários oferecidos que já passaram) e não pode ser usado.
 * Sem CPF, telefone ou conteúdo processual; o resumo é curto para não carregar históricos completos.
 */

export type Confiabilidade = 'verificado' | 'declarado' | 'inferido' | 'desatualizado';

export interface ItemMemoria {
  chave: string;
  valor: string;
  confiabilidade: Confiabilidade;
  fonte: string;
}

export interface MemoriaEstruturada {
  itens: ItemMemoria[];
  documentos: { pendentes: string[]; recebidos: string[] };
  automacoes: { tipo: string; estado: string }[];
  pendenciasEquipe: number;
  resumo: string;
}

export const REGRAS_MEMORIA = 'memoria_estruturada: afirme ao cliente só itens [verificado]. Itens [declarado] são o que o cliente disse (pode repetir sem confirmar como fato oficial). Itens [inferido] servem só para orientar a classificação. Itens [desatualizado] nunca devem ser usados. O que não estiver na memória ou no contexto é desconhecido: não invente.';

const LIMITE_RESUMO = 1400;

export function memoriaEstruturada(c: Conversa, opcoes: { checklist?: { nome: string; recebido: boolean }[] | undefined; agora?: Date } = {}): MemoriaEstruturada {
  const agora = opcoes.agora ?? new Date();
  const a = c.agenteAna;
  const itens: ItemMemoria[] = [];
  const add = (chave: string, valor: string | undefined, confiabilidade: Confiabilidade, fonte: string) => {
    const v = (valor ?? '').trim();
    if (v) itens.push({ chave, valor: v.slice(0, 160), confiabilidade, fonte });
  };

  // Consulta: só com recibo da agenda é fato.
  if (c.consultaAgendada) {
    const passou = Date.parse(c.consultaAgendada) <= agora.getTime();
    const recibo = a?.reservaCalendar?.inicio === c.consultaAgendada;
    add('consulta', formatarHorarioCliente(c.consultaAgendada), passou ? 'desatualizado' : recibo ? 'verificado' : 'inferido', recibo ? 'recibo da agenda' : 'registro sem recibo verificado');
  }
  if (a?.vinculoProjuris) add('vinculo_cadastro', a.vinculoProjuris.status === 'confirmado' ? 'confirmado' : 'pendente de confirmação da equipe', a.vinculoProjuris.status === 'confirmado' ? 'verificado' : 'inferido', a.vinculoProjuris.origem === 'telefone' ? 'telefone principal no cadastro' : 'CPF informado');
  if (c.tipoClienteAgenda) add('carteira_agenda', c.tipoClienteAgenda === 'cadastrado' ? 'cliente da casa' : 'cliente novo', 'verificado', 'cadastro ou confirmação da equipe');
  else if (a?.tipoCliente) add('carteira_agenda', a.tipoCliente === 'cadastrado' ? 'cliente da casa' : 'cliente novo', 'inferido', 'contexto da conversa');
  add('nome', a?.dados?.nome, 'declarado', 'informado na conversa');
  add('assunto', a?.dados?.assunto, 'declarado', 'informado na conversa');
  add('email', c.email || a?.dados?.email, 'declarado', 'texto validado do cliente');
  if (a?.resultado?.intencao) add('ultima_intencao', a.resultado.intencao, 'inferido', 'classificação da IA');
  if (c.etiquetaAcao && c.etiquetaAcao !== 'sem') add('area_provavel', String(c.etiquetaAcao), 'inferido', 'regra de entrada');
  const ofertas = a?.agendaReal ? a.horariosTeste ?? [] : [];
  const futuras = ofertas.filter(s => Date.parse(s) > agora.getTime());
  if (futuras.length) add('horarios_oferecidos', futuras.map(formatarHorarioCliente).join('; '), 'verificado', 'agenda oficial consultada');
  if (ofertas.length && !futuras.length) add('horarios_oferecidos', 'opções anteriores já passaram', 'desatualizado', 'agenda consultada antes');
  if (a?.horarioPendente) add('horario_escolhido_pendente', formatarHorarioCliente(a.horarioPendente), Date.parse(a.horarioPendente) > agora.getTime() ? 'declarado' : 'desatualizado', 'escolha do cliente aguardando nome');
  const etapa = c.contrato === 'assinado' ? 'contrato assinado' : c.contrato ? `contrato ${c.contrato}` : c.consultaAgendada ? 'consulta marcada' : c.etapa;
  add('etapa', etapa, 'verificado', 'registro do atendimento');

  const checklist = opcoes.checklist ?? [];
  const documentos = { pendentes: checklist.filter(i => !i.recebido).map(i => i.nome).slice(0, 15), recebidos: checklist.filter(i => i.recebido).map(i => i.nome).slice(0, 15) };
  const automacoes = automacoesAtivas(a?.secretaria?.automacoes, agora).map(x => ({ tipo: ROTULOS_TIPO[x.tipo], estado: ROTULOS_ESTADO[x.estado] }));
  const pendenciasEquipe = (c.avisosEquipe ?? []).filter(x => !x.resolvidoEm).length;

  const linhas = [
    ...itens.map(i => `- [${i.confiabilidade}] ${i.chave}: ${i.valor} (${i.fonte})`),
    ...(documentos.pendentes.length ? [`- [verificado] documentos pendentes: ${documentos.pendentes.join(', ')}`] : []),
    ...(documentos.recebidos.length ? [`- [verificado] documentos recebidos: ${documentos.recebidos.join(', ')}`] : []),
    ...automacoes.map(x => `- [verificado] automação ativa: ${x.tipo} (${x.estado})`),
    ...(pendenciasEquipe ? [`- [verificado] pendências com a equipe: ${pendenciasEquipe}`] : []),
  ];
  let resumo = '';
  for (const l of linhas) { if ((resumo + l).length + 1 > LIMITE_RESUMO) break; resumo += (resumo ? '\n' : '') + l; }
  return { itens, documentos, automacoes, pendenciasEquipe, resumo };
}
