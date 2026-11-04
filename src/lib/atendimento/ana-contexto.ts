import type { Conversa, Mensagem } from '../mock-data';
import type { AnaResult } from './ana-rules';

export interface TarefaRetorno {
  id: string; conversaId: string; responsavelId: string; assunto: string;
  origemIds: string[]; criadaEm: string; cobradaEm: string;
  status: 'pendente' | 'atendida'; notificadaEm: string;
  reconhecidaEm?: string; atendidaEm?: string; respostaId?: string;
}
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function cobraRetorno(texto: string) {
  return !/processo|pensao|trabalhista|andamento|audiencia/.test(fold(texto)) && /alguma novidade|(?:ficou|ficaram|ficamos).{0,35}retorno|(?:estou|to|continuo).{0,15}aguardando|conseguiu verificar|(?:iria|ia|vai).{0,20}consultar.{0,20}(?:doutora|dra)|sobre aquilo|aguardando.{0,20}retorno|me dar um retorno/.test(fold(texto));
}
export function historicoContato(c: Conversa, canal: string): Mensagem[] {
  return (c.mensagens ?? []).filter(m => (!m.canal || m.canal === canal) && m.de !== 'sistema' && m.status !== 'simulada');
}
/** Only explicit self-identification, never a name guessed from a legal question. */
export function apresentacaoNome(texto: string): string {
  const limpo = texto.trim().replace(/^(?:ol[aá]|oi|bom dia|boa tarde|boa noite)[\s,.!;:-]*/i, '');
  const match = limpo.match(/^(?:[ée]\s+(?:o|a)\s+|sou\s+(?:(?:o|a)\s+)?|me chamo\s+|meu nome [ée]\s+)([A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,7})[.!\s]*$/i);
  return match?.[1]?.trim() ?? '';
}
export function nomeConhecido(c: Conversa, canal: string, cadastroNome = ''): string {
  if (cadastroNome.trim()) return cadastroNome.trim();
  if (c.agenteAna?.dados?.nome?.trim()) return c.agenteAna.dados.nome.trim();
  const introducao = historicoContato(c, canal).filter(m => m.de === 'cliente').map(m => apresentacaoNome(m.texto)).find(Boolean);
  if (introducao) return introducao;
  return c.tipoClienteAgenda === 'cadastrado' ? c.nome.trim() : '';
}
export function atendimentoIniciado(c: Conversa, canal: string, messageId: string) {
  return !!c.agenteAna?.apresentado || !!nomeConhecido(c, canal) || !!c.consultaAgendada || historicoContato(c, canal).some(m => m.id !== messageId && m.de === 'escritorio');
}
export function contextoPersistente(c: Conversa, canal: string) {
  return {
    historico: historicoContato(c, canal).map(m => ({ id: m.id, data_hora: m.dataHora ?? null, de: m.de, texto: m.apagadaParaTodos ? '[Mensagem apagada]' : m.texto, arquivo: m.apagadaParaTodos ? '' : m.arquivo ?? '', autor: m.autor ?? '' })),
    continuidade: {
      nome_conhecido: nomeConhecido(c, canal), proximo_passo: c.agenteAna?.proximoPasso ?? '',
      assunto: c.agenteAna?.dados?.assunto ?? '', tarefas_retorno: c.tarefasRetorno ?? [],
      pedidos_processuais: (c.agenteAna?.pedidosProcesso ?? []).map(p => ({ codigo: p.codigo, status: p.status })),
      horarios_ja_apresentados: c.agenteAna?.horariosApresentados ?? [], horarios_equipe: c.horariosOfertados ?? [],
      horario_escolhido_pendente: c.agenteAna?.horarioPendente ?? null,
      reserva: c.agenteAna?.reservaCalendar ?? null, consulta: c.consultaAgendada ?? null, retorno: c.retornoAgendado ?? null,
      historico_operacional: c.timeline ?? [],
    },
  };
}
/** Preserves concurrent task creation/completion when an old browser edits other case fields. */
export function mesclarTarefasRetorno(antes: TarefaRetorno[] = [], depois: TarefaRetorno[] = [], atuais: TarefaRetorno[] = []) {
  const map = new Map(atuais.map(t => [t.id, t]));
  for (const t of depois) {
    const baseline = antes.find(a => a.id === t.id);
    if (!baseline || JSON.stringify(baseline) !== JSON.stringify(t)) map.set(t.id, t);
  }
  return [...map.values()];
}
export function registrarRetorno(c: Conversa, canal: string, messageId: string, ownerId: string, now = new Date()): Conversa {
  const msgs = historicoContato(c, canal);
  const pos = msgs.findIndex(m => m.id === messageId);
  if (pos < 0) return c;
  const anteriores = msgs.slice(0, pos).filter(m => !m.apagadaParaTodos);
  const promessa = [...anteriores].reverse().find(m => m.de === 'escritorio' && /retorno|verificar|conferir|consultar.{0,20}(?:doutora|dra)|equipe.{0,30}(?:responde|olhar)|registrad/.test(fold(m.texto)));
  const assuntoCliente = [...anteriores.slice(0, promessa ? anteriores.indexOf(promessa) : anteriores.length)].reverse().find(m => m.de === 'cliente' && !cobraRetorno(m.texto) && !apresentacaoNome(m.texto) && !/^(?:oi|ola|bom dia|boa tarde|boa noite|ok)[.!\s]*$/i.test(fold(m.texto)));
  const aberta = c.tarefasRetorno?.find(t => t.status === 'pendente' && t.conversaId === c.id && t.responsavelId === ownerId);
  const stamp = now.toISOString();
  const tarefa: TarefaRetorno = aberta ? { ...aberta, origemIds: [...new Set([...aberta.origemIds, messageId])], cobradaEm: stamp } : {
    id: `retorno:${c.id}:${promessa?.id ?? messageId}`, conversaId: c.id, responsavelId: ownerId,
    assunto: (assuntoCliente?.texto || c.agenteAna?.dados?.assunto || promessa?.texto || 'Retorno solicitado; assunto anterior não localizado, conferir com o cliente.').slice(0, 1200),
    origemIds: [...new Set([...(promessa ? [promessa.id] : []), ...(assuntoCliente ? [assuntoCliente.id] : []), messageId])],
    criadaEm: stamp, cobradaEm: stamp, status: 'pendente', notificadaEm: stamp,
  };
  return { ...c, tarefasRetorno: [...(c.tarefasRetorno ?? []).filter(t => t.id !== tarefa.id), tarefa],
    timeline: aberta ? c.timeline : [...c.timeline, { data: stamp, evento: `Tarefa de retorno para a equipe responsável: ${tarefa.assunto}` }],
  };
}
/** Structured completion must reference an actual sent office response, never model claims. */
export function respostaRetornoRegistrada(c: Conversa, canal: string): Mensagem | undefined {
  const tarefa = [...(c.tarefasRetorno ?? [])].reverse().find(t => t.status === 'atendida' && t.respostaId);
  return tarefa ? historicoContato(c, canal).find(m => m.id === tarefa.respostaId && m.de === 'escritorio' && !m.apagadaParaTodos && ['enviada', 'entregue', 'lida'].includes(m.status ?? '')) : undefined;
}
export function resultadoRetorno(c: Conversa, canal: string): AnaResult {
  const resposta = respostaRetornoRegistrada(c, canal);
  // Do not republish legal content from history; point to the already delivered team response.
  return { acao: 'enviar', mensagem: resposta ? 'A equipe já enviou uma resposta nesta conversa. Vou encaminhar sua nova solicitação para que confira se há outra atualização.' : 'Seu retorno ainda precisa ser conferido pela equipe. A solicitação está registrada nas tarefas do atendimento para o responsável acompanhar por aqui.',
    motivo_aprovacao: '', intencao: 'outro', urgente: false, encaminhar_humano: true,
    dados_coletados: { nome: nomeConhecido(c, canal), cpf: '', email: c.email ?? c.agenteAna?.dados?.email ?? '', assunto: '' },
    proximo_passo: 'Equipe responsável: conferir a tarefa de retorno e responder ao cliente; nenhuma providência jurídica presumida.',
  };
}
export function semReintroducao(texto: string, conhecido: boolean) {
  if (!conhecido) return texto;
  return texto.split('\n').filter(line => !/seja bem vindo|equipe cs advocacia|www\.carolinasantos|vou te ajudar|primeira consulta.*gratuita|sou a (?:ana|anne)/i.test(line)).join('\n').replace(/^\s*Ol[aá]\s*,?\s*\n+/i, '').trim();
}