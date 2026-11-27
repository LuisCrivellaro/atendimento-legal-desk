import type { Conversa, Mensagem } from '../mock-data';
import { cobraRetorno, historicoContato } from './ana-contexto';
import { leituraMensagemAna } from './ana-demanda';
import { pedidoHumano } from './ana-scheduling';
import { emColeta } from './coleta';
import { pedidoNoticiaProcesso } from './consulta-processo';
import { origemMensagem } from './secretaria/origem';
import { encaminhamentoAberto, mensagemSemConteudo, motivoEncaminhamento, pedidoAgendaTexto, respostaEfetivaEquipe, type EncaminhamentoAdvogado } from './encaminhamento-advogado';

/**
 * Reconciliação da fila do advogado (Fernando), pedido de 27/11/2026: o relatório das 09h informou "nenhum cliente"
 * porque a fila só nascia de mensagens novas processadas pela Anne. Aqui cada conversa é lida inteira (não só a
 * última mensagem, nem só as não lidas) para achar o pedido do cliente ainda sem resposta humana efetiva.
 * Puro e testado; a varredura paginada e a gravação ficam em `reconciliacao-advogado.server.ts`.
 */
export type TipoConversaAdvogado = 'pendente' | 'ambigua' | 'resolvida' | 'sem_solicitacao' | 'fora_escopo' | 'antiga';
export interface AvaliacaoConversaAdvogado {
  tipo: TipoConversaAdvogado;
  motivo: string;
  /** Data original do primeiro pedido ainda sem retorno. */
  desde?: string | undefined;
  origemId?: string | undefined;
  /** Mensagens do cliente que compõem o pedido sem retorno. */
  mensagens: string[];
}

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tempo = (m: Pick<Mensagem, 'dataHora'>) => Date.parse(m.dataHora ?? '');

// Pedidos indiretos de retorno: "A doutora conseguiu ver meu caso?", "Estou esperando um retorno", "Mandei mensagem ontem"…
const INDIRETO = new RegExp([
  '\\b(?:conseguiu|conseguiram|consegue|conseguem|pode|podem|vai|vao) (?:me )?(?:ver|verificar|analisar|olhar|ligar|retornar|responder|dar um retorno)\\b',
  '\\b(?:estou|to|tou|fico|sigo|continuo|ainda|ainda estou) (?:esperando|aguardando)\\b',
  '\\b(?:esperando|aguardando) (?:um |o |seu |o seu |algum )?(?:retorno|resposta|contato|posicionamento)\\b',
  '\\balguma (?:novidade|noticia|resposta|posicao)\\b',
  '\\bmandei (?:mensagem|msg|uma mensagem|audio|os documentos|ontem|antes)\\b',
  '\\bninguem (?:me )?(?:responde|respondeu|retornou|falou|deu retorno)\\b',
  '\\bquando (?:o advogado|a advogada|a doutora|a dra|voces?|vcs?|alguem) (?:vai|vao|pode|podem) (?:me )?(?:responder|retornar|ligar|falar)\\b',
  '\\b(?:preciso|queria|gostaria de|quero) tirar (?:uma )?duvida\\b',
  '\\btenho (?:uma |outra |mais uma )?(?:duvida|pergunta)\\b',
  '\\b(?:doutora|dra|carolina|advogad\\w*)\\b.{0,25}\\b(?:me ligar|ligar|retornar|responder|ver meu caso|analisar)\\b',
].join('|'));
// Promessa de retorno do escritório (equipe ou Anne) sem o retorno efetivo depois.
const PROMESSA = new RegExp([
  '\\b(?:vou|vamos|irei|iremos|ja vou) (?:verificar|ver|conferir|consultar|analisar|retornar|te retornar|responder|falar com)\\b',
  '\\b(?:te|lhe) (?:retorno|retornamos|respondemos|aviso|avisamos|dou um retorno)\\b',
  '\\bequipe (?:te |lhe )?(?:responde|retorna|vai (?:te |lhe )?(?:responder|retornar))\\b',
  '\\bpassei sua conversa para a equipe\\b',
  '\\bfica com a equipe responsavel\\b',
  '\\bja iremos retornar\\b',
  '\\bencaminh(?:ar|aremos|ei|amos|ado) (?:para|ao|a) (?:o )?(?:advogad|equipe|doutora|dra)',
].join('|'));
const ASSUNTO_JURIDICO = /\b(?:process|acao|audiencia|pericia|sentenca|recurso|acordo|intimacao|citacao|prazo|direito|indeniza|rescis|demiss|pensao|guarda|divorc|inventario|contrato|advogad|juiz|forum|tribunal|honorari|caso)/;
const ESCOLHA_HORARIO = /^\s*(?:(?:a |o )?op[cç][aã]o\s*)?[1-9]\s*$|^\s*\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*$|^\s*(?:o |a )?(?:primeir[oa]|segund[oa])(?: (?:opcao|horario))?\s*$/i;
const MENSAGEM_AGENDA_ANNE = /hor[aá]rios? livres|nome completo|confirmar (?:a sua|o seu|sua) (?:consulta|atendimento)|consulta (?:inicial )?(?:com a dra\.? carolina )?(?:est[aá] )?agendada|o que fica melhor para voc[eê]/i;

/** Mensagem do cliente que é da competência da Anne (agenda, escolha de horário, resposta a confirmação, coleta). */
function competenciaAnne(m: Mensagem, anteriores: Mensagem[], c: Conversa): boolean {
  if (m.tipo === 'audio') return false; // áudio é sempre da equipe
  if (m.arquivo) return emColeta(c);
  if (pedidoAgendaTexto(m.texto) || ESCOLHA_HORARIO.test(m.texto)) return true;
  const ultimaEscritorio = [...anteriores].reverse().find(x => x.de === 'escritorio');
  const curta = m.texto.trim().split(/\s+/).length <= 6 && !m.texto.includes('?');
  return !!ultimaEscritorio && origemMensagem(ultimaEscritorio) !== 'equipe' && MENSAGEM_AGENDA_ANNE.test(ultimaEscritorio.texto) && curta;
}

/** Pedido de notícia processual já decidido pela revisão depois da pergunta (entregue ou recusado pela Dra.). */
function processoJaDecidido(c: Conversa, m: Mensagem): boolean {
  const t = tempo(m);
  return (c.agenteAna?.pedidosProcesso ?? []).some(p => p.status !== 'pendente' && !p.evento && Date.parse(p.decisao?.em ?? '') >= (Number.isFinite(t) ? t : 0));
}

export const DIAS_MAXIMOS_RECONCILIACAO = 30;

/**
 * Avalia a conversa inteira. Resolução só por resposta humana efetiva da equipe ou marcação explícita da equipe
 * (Respondido/Concluído); nunca por mensagem automática, visualização, saudação, promessa de retorno, agradecimento
 * do cliente, atendimento humano, arquivamento ou relatório enviado.
 */
export function avaliarConversaAdvogado(c: Conversa, e: { situacao: string; agora: Date; canal?: string; identificacaoIndisponivel?: boolean; diasMaximos?: number }): AvaliacaoConversaAdvogado {
  const canal = e.canal ?? 'ultramsg';
  const hist = historicoContato(c, canal).filter(m => !m.apagadaParaTodos);
  let ultimaResposta = -1;
  hist.forEach((m, i) => { if (origemMensagem(m) === 'equipe' && respostaEfetivaEquipe(m.texto)) ultimaResposta = i; });
  const marcas = (c.encaminhamentos ?? []).flatMap(x => x.historico.filter(h => h.status === 'respondido' || h.status === 'concluido').map(h => Date.parse(h.em))).filter(Number.isFinite);
  const marca = marcas.length ? Math.max(...marcas) : -Infinity;
  const depois = hist.slice(ultimaResposta + 1).filter(m => !(Number.isFinite(tempo(m)) && tempo(m) <= marca));
  const relevantes = depois.filter((m, k) => m.de === 'cliente' && !m.filtroComercial
    && (m.tipo === 'audio' || !!m.arquivo || !mensagemSemConteudo(m.texto))
    && !competenciaAnne(m, depois.slice(0, k), c)
    && !(pedidoNoticiaProcesso(m.texto) && processoJaDecidido(c, m)));
  const resolvida = ultimaResposta >= 0 || Number.isFinite(marca);
  if (!relevantes.length) return { tipo: resolvida ? 'resolvida' : 'sem_solicitacao', motivo: resolvida ? 'respondida pela equipe' : 'sem pedido do cliente pendente', mensagens: [] };
  const primeira = relevantes[0]!;
  const ultima = relevantes.at(-1)!;
  const base = { desde: primeira.dataHora ?? e.agora.toISOString(), origemId: primeira.id, mensagens: relevantes.map(m => m.id) };
  const forte = relevantes.some(m => m.tipo === 'audio' || pedidoHumano(m.texto) || motivoEncaminhamento(m.texto) === 'falar_dra' || cobraRetorno(m.texto)
    || INDIRETO.test(fold(m.texto)) || pedidoNoticiaProcesso(m.texto) || leituraMensagemAna(m.texto) === 'nova_demanda'
    || m.texto.includes('?') && ASSUNTO_JURIDICO.test(fold(m.texto)));
  const promessa = hist.slice(ultimaResposta + 1).some(m => m.de === 'escritorio' && PROMESSA.test(fold(m.texto)));
  const idade = (e.agora.getTime() - tempo(ultima)) / 86400000;
  if (Number.isFinite(idade) && idade > (e.diasMaximos ?? DIAS_MAXIMOS_RECONCILIACAO)) {
    return { tipo: 'antiga', motivo: `pedido sem retorno há ${Math.floor(idade)} dias: conferir se já foi resolvido fora do WhatsApp`, ...base };
  }
  if (e.situacao === 'ativo') return { tipo: 'pendente', motivo: forte || promessa ? 'cliente ativo aguardando retorno' : 'mensagem de cliente ativo sem resposta da equipe', ...base };
  // Lead: dúvida sobre serviços é captação da Anne; só retorno prometido pelo escritório e não cumprido vai à conferência.
  if (e.situacao === 'novo_lead' && !promessa && !e.identificacaoIndisponivel) return { tipo: 'fora_escopo', motivo: 'lead em atendimento da Anne', ...base };
  if (forte || promessa) {
    const motivo = e.identificacaoIndisponivel ? 'cadastro do ProJuris indisponível para confirmar o vínculo'
      : e.situacao === 'novo_lead' ? 'retorno prometido ou pedido ao advogado de contato sem cadastro confirmado'
      : `vínculo "${e.situacao}" sem processo ativo confirmado`;
    return { tipo: 'ambigua', motivo: `${motivo}: conferir`, ...base };
  }
  return { tipo: 'fora_escopo', motivo: e.situacao === 'novo_lead' ? 'lead em atendimento da Anne' : 'sem vínculo ativo e sem pedido ao advogado', ...base };
}

export interface DadosReconciliacao { responsavel: string; nomeCliente: string; telefone: string; processo: string }
/**
 * Cria ou atualiza a pendência (mesma fila, sem mensagem ao cliente: aviso "sem_aviso"), preservando a data original
 * do pedido. Id determinístico: rodar de novo nunca duplica e nunca recria uma pendência concluída. Devolve undefined
 * quando não há nada a mudar.
 */
export function aplicarReconciliacao(c: Conversa, av: AvaliacaoConversaAdvogado, d: DadosReconciliacao, agora = new Date(), canal = 'ultramsg'): { conversa: Conversa; criada: boolean } | undefined {
  if ((av.tipo !== 'pendente' && av.tipo !== 'ambigua') || !av.origemId) return undefined;
  const stamp = agora.toISOString();
  const conferir = av.tipo === 'ambigua' ? av.motivo : undefined;
  const aberto = encaminhamentoAberto(c, canal, agora);
  if (aberto) {
    const novas = av.mensagens.filter(id => !aberto.mensagensCliente.includes(id));
    const antes = av.desde && Date.parse(av.desde) < Date.parse(aberto.criadoEm);
    // Pendência confirmada nunca vira "conferir"; uma "conferir" vira confirmada quando o vínculo se confirma.
    const limparConferir = !!aberto.conferir && !conferir;
    const completar = !aberto.processo && !!d.processo || !aberto.nomeCliente && !!d.nomeCliente;
    if (!novas.length && !antes && !limparConferir && !completar) return undefined;
    const atualizado: EncaminhamentoAdvogado = {
      ...aberto,
      atualizadoEm: stamp,
      mensagensCliente: [...new Set([...aberto.mensagensCliente, ...av.mensagens])].slice(-30),
      ...(antes ? { criadoEm: av.desde!, mensagemOrigemId: av.origemId } : {}),
      ...(limparConferir ? { conferir: undefined } : {}),
      processo: aberto.processo || d.processo,
      nomeCliente: aberto.nomeCliente || d.nomeCliente,
    };
    return { conversa: { ...c, encaminhamentos: (c.encaminhamentos ?? []).map(x => x.id === aberto.id ? atualizado : x) }, criada: false };
  }
  const id = `encaminhamento:${c.id}:${av.origemId}`;
  if ((c.encaminhamentos ?? []).some(x => x.id === id)) return undefined;
  const textos = (c.mensagens ?? []).filter(m => av.mensagens.includes(m.id)).map(m => m.texto).join(' ');
  const novo: EncaminhamentoAdvogado = {
    id, responsavel: d.responsavel, status: 'aguardando', criadoEm: av.desde ?? stamp, atualizadoEm: stamp,
    mensagemOrigemId: av.origemId, mensagensCliente: av.mensagens.slice(-30), nomeCliente: d.nomeCliente, telefone: d.telefone,
    processo: d.processo, motivo: motivoEncaminhamento(textos), aviso: { estado: 'sem_aviso', mensagemId: av.origemId, em: stamp },
    historico: [{ em: stamp, status: 'aguardando', por: 'Reconciliação' }], origem: 'reconciliacao', ...(conferir ? { conferir } : {}),
  };
  return {
    conversa: { ...c, encaminhamentos: [...(c.encaminhamentos ?? []), novo].slice(-20), timeline: [...(c.timeline ?? []), { data: stamp, evento: `Pendência de ${d.responsavel} recuperada pela verificação da fila (sem mensagem ao cliente).` }] },
    criada: true,
  };
}
