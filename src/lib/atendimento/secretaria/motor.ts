import { bloqueadoPorTeste, FUNCIONALIDADES, nivelPermissao, type Camada, type ConfigSecretaria, type Funcionalidade, type JanelaAutomacoes } from './config';
import type { ModoAnne } from './modos';
import type { OrigemMensagem } from './origem';

/**
 * Motor determinístico de decisões e permissões. Independe do modelo: recebe só fatos já verificados pelo
 * servidor e devolve se a ação pode ser executada, e por quê. O modelo nunca escolhe a entrada nem a saída.
 * Em ambiguidade, conflito ou caso não previsto, encaminha à equipe.
 */

export type ResultadoMotor = 'executar' | 'bloquear' | 'adiar' | 'encaminhar' | 'aprovacao' | 'ignorar';

export type CodigoMotivo =
  | 'permitido'
  | 'recurso_desligado'
  | 'origem_propria'
  | 'duplicada'
  | 'pausa_global'
  | 'agente_desligado'
  | 'canal_inativo'
  | 'modo_bloqueado'
  | 'modo_humano'
  | 'modo_hibrido'
  | 'permissao_desligada'
  | 'permissao_aprovacao'
  | 'contato_nao_liberado'
  | 'possivel_injecao'
  | 'fora_do_escopo'
  | 'limite_respostas'
  | 'identidade_nao_verificada'
  | 'dados_nao_verificados'
  | 'pendencia_operacional'
  | 'automacao_invalida'
  | 'ambiguidade'
  | 'humano_respondeu_depois'
  | 'conteudo_sensivel'
  | 'prioridade_humana'
  | 'prioridade_humana_urgente'
  | 'fora_do_horario'
  | 'nao_necessaria'
  | 'vencida'
  | 'falha_integracao'
  | 'modo_teste'
  | 'modo_alterado';

/** Textos para a equipe (Atendimento, histórico e auditoria). Nunca incluem texto do cliente. */
export const MOTIVOS: Record<CodigoMotivo, string> = {
  permitido: 'Ação autorizada pelas regras.',
  recurso_desligado: 'Secretaria digital desligada: vale o fluxo anterior.',
  origem_propria: 'Mensagem da própria Anne ou de uma automação: nunca respondida (proteção contra loop).',
  duplicada: 'Ação já executada ou reservada (sem repetição).',
  pausa_global: 'IA da Anne pausada (o provedor recusou a chave): só as respostas escritas pelo modelo aguardam.',
  agente_desligado: 'Agente desligado na configuração do canal.',
  canal_inativo: 'Canal do WhatsApp não está ativo.',
  modo_bloqueado: 'Conversa no modo Bloqueado.',
  modo_humano: 'Conversa no modo Humano: só a equipe envia.',
  modo_hibrido: 'Modo Híbrido: a equipe conduz a conversa; Anne não responde livremente.',
  permissao_desligada: 'Funcionalidade desligada pela administração.',
  permissao_aprovacao: 'Funcionalidade exige aprovação humana: texto pronto para a equipe.',
  contato_nao_liberado: 'Contato do WhatsApp não liberado ou não vinculado a esta conversa.',
  possivel_injecao: 'Mensagem com instruções dirigidas à IA: tratada como não confiável e passada à equipe.',
  fora_do_escopo: 'Pedido de orientação jurídica, honorários ou resultado: só a equipe responde.',
  limite_respostas: 'Limite de respostas automáticas atingido nesta conversa (proteção contra loop).',
  identidade_nao_verificada: 'Identidade do cliente não verificada para esta informação.',
  dados_nao_verificados: 'Dados necessários não confirmados em fonte oficial (agenda, cadastro ou recibo).',
  pendencia_operacional: 'Há falha ou operação de agenda pendente nesta conversa: a equipe confere antes.',
  automacao_invalida: 'Automação expirada, concluída ou inexistente.',
  ambiguidade: 'Mensagem ambígua ou várias automações ativas ao mesmo tempo: a equipe decide.',
  humano_respondeu_depois: 'A equipe escreveu depois da automação: a resposta do cliente fica com a equipe.',
  conteudo_sensivel: 'Conteúdo sensível ou que exige interpretação: aprovação humana.',
  prioridade_humana: 'A equipe interagiu há pouco: automação adiada.',
  prioridade_humana_urgente: 'Automação urgente bloqueada pela prioridade humana: equipe avisada.',
  fora_do_horario: 'Fora do horário configurado para automações: adiada.',
  nao_necessaria: 'Mensagem programada não é mais necessária.',
  vencida: 'Mensagem programada vencida.',
  falha_integracao: 'Falha na integração: nada foi confirmado ao cliente; equipe avisada.',
  modo_teste: 'Modo de teste das automações: só o número autorizado recebe mensagens automáticas.',
  modo_alterado: 'Modo da conversa alterado.',
};

export interface AmbienteMotor {
  agenteAtivo: boolean;
  canalAtivo: boolean;
  /** Pausa da IA do escritório (chave do provedor recusada): impede só a resposta conversacional (modelo). */
  iaPausada: boolean;
}

export interface EntradaMotor {
  funcionalidade: Funcionalidade;
  config: ConfigSecretaria;
  /** Resultado de `secretariaAtiva` (flag da área de trabalho + chave mestra do servidor). */
  ativa: boolean;
  modo: ModoAnne;
  ambiente: AmbienteMotor;
  /** Contato liberado e vinculado a esta conversa no canal ativo. */
  contatoLiberado: boolean;
  /** Número do contato (só para o modo de teste das automações). */
  contato?: string | undefined;
  /** Origem da mensagem que disparou a ação (respostas) ou 'sistema' para rotinas. */
  origem: OrigemMensagem;
  agora: Date;
  ultimaIntervencaoHumana?: string | undefined;
  /** A ação não pode ser adiada (ex.: confirmação de 40 minutos). */
  urgente?: boolean | undefined;
  jaExecutada?: boolean | undefined;
  pendenciaOperacional?: boolean | undefined;
  /** false quando a ação depende de dado não confirmado (recibo da agenda, cadastro...). */
  dadosVerificados?: boolean | undefined;
  /** false quando a ação usa dado do cliente sem identidade verificada. */
  identidadeVerificada?: boolean | undefined;
  /** Contexto de resposta dentro de uma automação. */
  automacao?: { valida: boolean; candidatas: number; ultimaDoEscritorio: boolean } | undefined;
  conteudoSensivel?: boolean | undefined;
  foraDoEscopo?: boolean | undefined;
  injecao?: boolean | undefined;
  limiteRespostas?: boolean | undefined;
  /** Sujeita à janela de horário das automações (follow-up, coleta, programadas). */
  respeitaHorario?: boolean | undefined;
}

export interface DecisaoMotor {
  resultado: ResultadoMotor;
  funcionalidade: Funcionalidade;
  camada: Camada;
  motivo: CodigoMotivo;
  texto: string;
  /** Criar aviso para a equipe (Atendimento e Assessor). */
  avisarEquipe: boolean;
  prioridade: boolean;
  adiarAte?: string | undefined;
}

const RESPOSTAS: Funcionalidade[] = ['resposta_conversacional', 'resposta_automacao'];

function horaSP(agora: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora).map(x => [x.type, x.value]));
  return { dia: `${p['year']}-${p['month']}-${p['day']}`, hhmm: `${p['hour']}:${p['minute']}`, semana: p['weekday'] ?? '' };
}

const FIM_DE_SEMANA = ['Sat', 'Sun'];

export function dentroDaJanela(agora: Date, j: JanelaAutomacoes) {
  const h = horaSP(agora);
  if (j.diasUteis && FIM_DE_SEMANA.includes(h.semana)) return false;
  return h.hhmm >= j.inicio && h.hhmm < j.fim;
}

/** Próximo início da janela (fuso fixo -03:00 de São Paulo, sem horário de verão desde 2019). */
export function proximaJanela(agora: Date, j: JanelaAutomacoes) {
  for (let d = 0; d < 8; d++) {
    const base = new Date(agora.getTime() + d * 86400000);
    const h = horaSP(base);
    if (j.diasUteis && FIM_DE_SEMANA.includes(h.semana)) continue;
    const inicio = new Date(`${h.dia}T${j.inicio}:00-03:00`);
    if (inicio.getTime() > agora.getTime()) return inicio.toISOString();
  }
  return new Date(agora.getTime() + 86400000).toISOString();
}

function decisao(e: EntradaMotor, resultado: ResultadoMotor, motivo: CodigoMotivo, extra: Partial<Pick<DecisaoMotor, 'avisarEquipe' | 'prioridade' | 'adiarAte'>> = {}): DecisaoMotor {
  return {
    resultado, funcionalidade: e.funcionalidade, camada: FUNCIONALIDADES[e.funcionalidade].camada, motivo, texto: MOTIVOS[motivo],
    avisarEquipe: extra.avisarEquipe ?? false, prioridade: extra.prioridade ?? false, ...(extra.adiarAte ? { adiarAte: extra.adiarAte } : {}),
  };
}

/**
 * Decide uma ação. A ordem das regras é parte do contrato (testada): a primeira que impede vence.
 * Automações operacionais impedidas avisam a equipe quando a ação era esperada pelo cliente (texto pronto).
 */
export function decidirAcao(e: EntradaMotor): DecisaoMotor {
  const f = e.funcionalidade;
  const camada = FUNCIONALIDADES[f].camada;
  const operacional = camada === 'operacional';
  const proativa = operacional && f !== 'resposta_automacao';
  const avisoOperacional = { avisarEquipe: operacional, prioridade: !!e.urgente };

  if (!e.ativa) return decisao(e, 'ignorar', 'recurso_desligado');
  // Nunca responder às próprias mensagens nem às da equipe.
  if (RESPOSTAS.includes(f) && e.origem !== 'cliente') return decisao(e, 'ignorar', 'origem_propria');
  if (e.jaExecutada) return decisao(e, 'ignorar', 'duplicada');

  const nivel = nivelPermissao(e.config, f);

  // Sugestão interna: nada sai para o cliente. Só o modo Bloqueado e a administração impedem.
  if (f === 'sugestao_interna') {
    if (e.modo === 'bloqueado') return decisao(e, 'bloquear', 'modo_bloqueado');
    if (nivel === 'desligado') return decisao(e, 'bloquear', 'permissao_desligada');
    if (e.injecao) return decisao(e, 'encaminhar', 'possivel_injecao', { avisarEquipe: true });
    return decisao(e, 'executar', 'permitido');
  }

  // Automações operacionais não usam o modelo: seguem com a IA pausada.
  if (e.ambiente.iaPausada && f === 'resposta_conversacional') return decisao(e, 'bloquear', 'pausa_global');
  if (!e.ambiente.agenteAtivo) return decisao(e, 'bloquear', 'agente_desligado', avisoOperacional);
  if (!e.ambiente.canalAtivo) return decisao(e, 'bloquear', 'canal_inativo', avisoOperacional);

  // Modo da conversa.
  if (e.modo === 'bloqueado') return decisao(e, 'bloquear', 'modo_bloqueado', avisoOperacional);
  if (f === 'resposta_conversacional' && e.modo !== 'automatico') return decisao(e, 'bloquear', e.modo === 'humano' ? 'modo_humano' : 'modo_hibrido');
  if (e.modo === 'humano') return f === 'resposta_automacao' ? decisao(e, 'encaminhar', 'modo_humano') : decisao(e, 'bloquear', 'modo_humano', avisoOperacional);

  // Matriz de permissões (administração).
  if (nivel === 'desligado') return decisao(e, 'bloquear', 'permissao_desligada');

  if (!e.contatoLiberado) return decisao(e, 'bloquear', 'contato_nao_liberado', avisoOperacional);
  // Modo de teste controlado: automação operacional só para o número autorizado (o restante não sai, sem aviso).
  if (operacional && bloqueadoPorTeste(e.config, e.contato)) return decisao(e, 'bloquear', 'modo_teste');
  if (e.injecao) return decisao(e, 'encaminhar', 'possivel_injecao', { avisarEquipe: true });
  if (e.foraDoEscopo) return decisao(e, 'encaminhar', 'fora_do_escopo', { avisarEquipe: true });
  if (e.limiteRespostas) return decisao(e, 'bloquear', 'limite_respostas', { avisarEquipe: true });
  if (e.identidadeVerificada === false) return decisao(e, 'encaminhar', 'identidade_nao_verificada', { avisarEquipe: true });
  if (e.dadosVerificados === false) return decisao(e, 'encaminhar', 'dados_nao_verificados', { avisarEquipe: true, prioridade: !!e.urgente });
  if (e.pendenciaOperacional && operacional) return decisao(e, 'encaminhar', 'pendencia_operacional', { avisarEquipe: true, prioridade: !!e.urgente });

  if (f === 'resposta_automacao') {
    const a = e.automacao;
    if (!a || !a.valida) return decisao(e, 'encaminhar', 'automacao_invalida');
    if (a.candidatas > 1) return decisao(e, 'encaminhar', 'ambiguidade', { avisarEquipe: true });
    if (!a.ultimaDoEscritorio) return decisao(e, 'encaminhar', 'humano_respondeu_depois');
  }

  if (e.conteudoSensivel) return decisao(e, 'aprovacao', 'conteudo_sensivel', { avisarEquipe: true });
  if (nivel === 'aprovacao') return decisao(e, 'aprovacao', 'permissao_aprovacao', { avisarEquipe: true, prioridade: !!e.urgente });

  // Prioridade humana: automações proativas esperam a equipe; as urgentes viram aviso prioritário.
  if (proativa && e.ultimaIntervencaoHumana) {
    const fimJanela = Date.parse(e.ultimaIntervencaoHumana) + e.config.janelaPrioridadeHumanaMin * 60000;
    if (Number.isFinite(fimJanela) && e.agora.getTime() < fimJanela) {
      return e.urgente
        ? decisao(e, 'encaminhar', 'prioridade_humana_urgente', { avisarEquipe: true, prioridade: true })
        : decisao(e, 'adiar', 'prioridade_humana', { adiarAte: new Date(fimJanela).toISOString() });
    }
  }
  if (proativa && e.respeitaHorario && !dentroDaJanela(e.agora, e.config.janelaAutomacoes)) {
    return decisao(e, 'adiar', 'fora_do_horario', { adiarAte: proximaJanela(e.agora, e.config.janelaAutomacoes) });
  }
  return decisao(e, 'executar', 'permitido');
}
