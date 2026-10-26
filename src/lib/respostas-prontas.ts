// Mensagens prontas do Atendimento: biblioteca padrão + mensagens criadas pela equipe.
// Regras puras (sem React, sem banco) para poderem ser testadas.
import type { Conversa, Etapa } from './mock-data';
import { normalized } from './atendimento';

export const REPLY_CATEGORIES = ['Boas-vindas', 'Documentos', 'Agendamento', 'Processo', 'Geral'] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export interface QuickReply {
  id: string;
  titulo: string;
  texto: string;
  categoria: ReplyCategory;
  /** Digitado depois da barra na caixa de mensagem, ex.: "ola" para /ola. */
  atalho: string;
  /** Etapas em que a mensagem aparece como sugestão rápida. */
  etapas?: Etapa[] | undefined;
  padrao?: boolean | undefined;
}

/** O que fica salvo na área de trabalho do usuário (raiz do office_workspace, como as automações). */
export interface SavedReplies {
  itens: QuickReply[];
  /** Mensagens padrão que o usuário removeu da lista. */
  ocultas: string[];
}

export const VARIABLES = [
  { key: 'nome', label: 'Primeiro nome' },
  { key: 'nome_completo', label: 'Nome completo' },
  { key: 'documentos_faltantes', label: 'Documentos faltantes' },
  { key: 'atendimento', label: 'Nº do atendimento' },
  { key: 'data_horario', label: 'Data e horário (preencher)' },
] as const;

export const DEFAULT_REPLIES: QuickReply[] = [
  {"id": "ola", "titulo": "Saudação", "categoria": "Boas-vindas", "atalho": "ola", "texto": "Olá, {nome}! Tudo bem?\n\nAqui é da equipe da Dra. Carolina Santos, da CS Lawyers | Advocacia. Como podemos te ajudar?", "etapas": ["inicial"]},
  {"id": "entender", "titulo": "Entender o caso", "categoria": "Boas-vindas", "atalho": "caso", "texto": "{nome}, para entendermos melhor a sua situação e conseguirmos te orientar da forma adequada, pode nos contar brevemente o que aconteceu?\n\nSe puder, inclua as principais informações e quando isso ocorreu.", "etapas": ["inicial"]},
  {"id": "cs-boas-vindas", "titulo": "Boas-vindas e consulta", "categoria": "Boas-vindas", "atalho": "bemvindo", "texto": "Olá, {nome}! Seja muito bem-vindo(a).\n\nA Dra. Carolina realiza uma consulta online de aproximadamente 30 minutos, pelo Google Meet, para entender melhor o seu caso e esclarecer suas principais dúvidas.\n\nA consulta inicial é gratuita. Se quiser, podemos verificar os horários disponíveis para você.", "etapas": ["inicial"]},
  {"id": "recebido", "titulo": "Documento recebido", "categoria": "Documentos", "atalho": "recebido", "texto": "Recebemos o seu documento, {nome}.\n\nVamos deixá-lo registrado para conferência da equipe. Caso seja necessário algum documento ou informação adicional, entraremos em contato por aqui.", "etapas": ["documentos"]},
  {"id": "faltam", "titulo": "Solicitar documentos faltantes", "categoria": "Documentos", "atalho": "faltam", "texto": "{nome}, para conseguirmos dar continuidade à análise, ainda precisamos dos seguintes documentos:\n\n{documentos_faltantes}\n\nQuando puder, pode nos enviar por aqui mesmo.", "etapas": ["documentos"]},
  {"id": "foto", "titulo": "Foto ou documento ilegível", "categoria": "Documentos", "atalho": "foto", "texto": "{nome}, recebemos o arquivo, mas a imagem ficou um pouco difícil de ler.\n\nQuando puder, poderia enviar novamente uma foto mais nítida, de preferência com boa iluminação e mostrando o documento inteiro?"},
  {"id": "agendar", "titulo": "Oferecer agendamento", "categoria": "Agendamento", "atalho": "agendar", "texto": "{nome}, podemos agendar uma conversa com a Dra. Carolina para que ela entenda melhor o seu caso.\n\nSe quiser, posso verificar os próximos horários disponíveis para você.", "etapas": ["inicial"]},
  {"id": "confirmado", "titulo": "Consulta confirmada", "categoria": "Agendamento", "atalho": "confirmado", "texto": "Pronto, {nome}! Sua consulta com a Dra. Carolina está confirmada para:\n\n{data_horario}\n\nA consulta será online, pelo Google Meet. O link será enviado para o e-mail informado no agendamento."},
  {"id": "lembrar", "titulo": "Lembrete de consulta", "categoria": "Agendamento", "atalho": "lembrar", "texto": "Olá, {nome}! Passando para lembrar que sua consulta com a Dra. Carolina está marcada para {data_horario}.\n\nSe surgir algum imprevisto e você precisar remarcar, é só nos avisar por aqui."},
  {"id": "remarcar", "titulo": "Remarcar consulta", "categoria": "Agendamento", "atalho": "remarcar", "texto": "Claro, {nome}. Sem problema.\n\nPodemos verificar um novo horário para a sua consulta com a Dra. Carolina. Qual dia ou período costuma ser melhor para você?"},
  {"id": "cancelar", "titulo": "Confirmar cancelamento", "categoria": "Agendamento", "atalho": "cancelar", "texto": "Claro, {nome}.\n\nSó para confirmarmos antes de cancelar: você realmente deseja cancelar sua consulta marcada para {data_horario}?"},
  {"id": "cancelado", "titulo": "Cancelamento confirmado", "categoria": "Agendamento", "atalho": "cancelado", "texto": "Pronto, {nome}. Sua consulta foi cancelada.\n\nSe quiser marcar uma nova data futuramente, estaremos à disposição por aqui."},
  {"id": "verificar", "titulo": "Equipe verificando", "categoria": "Geral", "atalho": "aguarde", "texto": "Entendi, {nome}.\n\nVou deixar essa informação registrada para a equipe verificar com atenção. Assim que tivermos um retorno, continuaremos o atendimento por aqui.", "etapas": ["inicial", "documentos", "ativo"]},
  {"id": "documentos", "titulo": "Envio de documentos", "categoria": "Documentos", "atalho": "documentos", "texto": "Pode enviar os documentos por aqui mesmo, {nome}.\n\nA equipe fará a conferência e, caso seja necessário complementar alguma informação, avisaremos você por esta conversa.", "etapas": ["documentos"]},
  {"id": "andamento", "titulo": "Dúvida sobre processo em andamento", "categoria": "Processo", "atalho": "processo", "texto": "{nome}, recebemos sua mensagem.\n\nComo essa dúvida envolve o andamento do seu processo, vou deixar o pedido registrado para que a equipe responsável verifique e retorne para você por aqui.", "etapas": ["ativo"]},
  {"id": "honorarios", "titulo": "Dúvida sobre honorários", "categoria": "Geral", "atalho": "honorarios", "texto": "{nome}, as condições de honorários dependem da análise de cada caso.\n\nA Dra. Carolina poderá explicar tudo com clareza durante a consulta, depois de entender melhor a sua situação."},
  {"id": "valor", "titulo": "Pergunta sobre valor da causa ou indenização", "categoria": "Geral", "atalho": "valor", "texto": "Entendo a sua dúvida, {nome}.\n\nPara estimar qualquer valor, a Dra. Carolina precisa primeiro analisar os detalhes e documentos do caso. Ela poderá esclarecer isso com você durante a consulta."},
  {"id": "presencial", "titulo": "Atendimento presencial", "categoria": "Geral", "atalho": "presencial", "texto": "{nome}, a consulta inicial é realizada online, pelo Google Meet.\n\nSe houver necessidade de atendimento presencial posteriormente, a equipe poderá verificar isso com você."},
  {"id": "finalizar", "titulo": "Encerramento cordial", "categoria": "Geral", "atalho": "finalizar", "texto": "Perfeito, {nome}.\n\nSe precisar de qualquer outra informação ou tiver alguma dúvida, pode nos chamar por aqui. Ficamos à disposição."},
  {"id": "obrigada", "titulo": "Agradecimento", "categoria": "Geral", "atalho": "obrigado", "texto": "Nós que agradecemos pelo contato, {nome}.\n\nFicamos à disposição sempre que precisar."},
  { id: 'sem-novidades', titulo: 'Sem novidades no processo', categoria: 'Processo', atalho: 'novidades', etapas: ['ativo'], texto: '{nome}, conferimos o seu processo e ainda não há novidades. Assim que houver qualquer movimentação, avisamos você por aqui.' },
  { id: 'cs-orcamento', titulo: 'Orçamento (Tabela OAB/SP)', categoria: 'Processo', atalho: 'orcamento', texto: 'Oi, {nome} 😊\n\nConforme solicitado, segue o orçamento dos serviços jurídicos:\n\n📌 Para o seu caso, vamos fazer o valor mínimo previsto na Tabela da OAB/SP.\n\n📋 Item {item_tabela} – *{tipo_acao}*\nValor mínimo da Tabela OAB/SP: R$ {valor_total}.\n\n✅ Para pagamento à vista (PIX), conseguimos conceder 10% de desconto.\n\n📌 O valor também pode ser parcelado em até *10x de R$ {valor_parcela}* no cartão.\n\n📌 Caso prefira, também é possível realizar uma entrada e parcelar o restante. Nessa modalidade, conseguimos manter os 10% de desconto sobre o valor total.\n\nAssim que você aprovar, já encaminhamos o link de pagamento e a documentação necessária para iniciarmos a demanda 😊\n\nFicamos à disposição para qualquer dúvida! Orçamento válido por 5 dias!\n\nEquipe CS Lawyers ⚖️ 🩵' },
  { id: 'cs-audiencia', titulo: 'Lembrete de audiência presencial', categoria: 'Processo', atalho: 'audiencia', etapas: ['ativo'], texto: 'Oi, {nome}! 😊\n\nEstamos passando para te lembrar da sua audiência, que será realizada PRESENCIALMENTE, no dia {data} às {hora} - {tipo_audiencia}.\n\n📌 Processo: {processo}\n\n📌 Vara: {vara}\n\n📍 Local da audiência:\n{endereco}\n\n📌 Solicitamos que você compareça ao local com uma hora de antecedência, portando um documento oficial com foto.\n\n📌 Caso possua testemunha, peço que a informe sobre a data, horário e local da audiência, para que ela também possa se organizar com antecedência. Por gentileza, nos envie um print do aviso da testemunha.\n\nQualquer dúvida, estou à disposição! 🩵\n\nEquipe CS Lawyers ⚖️' },
  { id: 'cs-reagendar', titulo: 'Reagendar consulta', categoria: 'Agendamento', atalho: 'reagendar', texto: 'Oi, {nome}! Tudo bem? 😊\n\nFique tranquilo(a), sabemos que imprevistos acontecem.\n\nEstou passando para reagendarmos sua consulta e garantir que você receba a orientação necessária sobre o seu caso com calma e atenção.\n\nHoje temos disponibilidade às {horario_1} ou às {horario_2}.\n\nQual desses horários fica melhor para você?' },
  { id: 'cs-confirmar-hoje', titulo: 'Confirmar atendimento de hoje', categoria: 'Agendamento', atalho: 'confirmahoje', texto: 'Olá, {nome}!\n\nBom dia! 😊\n\nPassando para confirmar o seu atendimento hoje às {hora} ✅\n\nEquipe CS Advocacia ⚖️ Lawyers' },
  { id: 'cs-pericia', titulo: 'Perícia agendada pelo tribunal', categoria: 'Processo', atalho: 'pericia', etapas: ['ativo'], texto: '📍 Atenção: Perícia agendada pelo Tribunal!\n\n⚠️ Sua perícia foi marcada para:\n\n📆 {data}, às {hora}, no endereço: {endereco}\n\n‼️⏰ Lembramos que você deve estar presente no local com 15 minutos de antecedência do horário agendado.\n\nObrigada 😊\n\nEquipe CS Advocacia\ncarolinasantos.com.br' },
  { id: 'cs-pericia-amanha', titulo: 'Lembrete: perícia amanhã', categoria: 'Processo', atalho: 'periciaamanha', etapas: ['ativo'], texto: '📍 Lembrando que:\n\n⚠️ Sua perícia de {tipo_pericia} será amanhã, {data}, às {hora}, no endereço {endereco}. ✅\n\n‼️⏰ Lembramos que você deve estar presente no local com 15 minutos de antecedência do horário agendado.\n\nObrigada 😊\n\nEquipe CS Advocacia\ncarolinasantos.com.br' },
  { id: 'cs-contrato-gov', titulo: 'Contrato para assinatura (GOV)', categoria: 'Documentos', atalho: 'contratogov', texto: 'Oi, {nome}! Tudo bem? 😊\n\nSegue o contrato para assinatura.\n\nAlguns lembretes importantes:\n\n📌 A assinatura deverá ser realizada por meio do *GOV Assinaturas*;\n\n📌 Caso prefira, a assinatura também poderá ser feita *de próprio punho*. Nesse caso, basta imprimir o documento, assiná-lo, escanear o documento e nos enviar.\n\n📌 Assim que finalizar a assinatura, pedimos, por gentileza, que nos encaminhe o documento assinado novamente por aqui.\n\nCaso tenha qualquer dificuldade para realizar a assinatura, pode me chamar que eu te auxilio, tá bem? 💛\n\nFicaremos no aguardo para dar continuidade ao seu atendimento. 😊✅\n\n*Equipe CS Advocacia*\ncarolinasantos.com.br' },
  { id: 'cs-ata', titulo: 'Ata da audiência enviada', categoria: 'Processo', atalho: 'ata', etapas: ['ativo'], texto: 'Oi, {nome}! 😊\n\nSegue em anexo a ata da audiência.\n\nO julgamento do processo ficou designado para o dia {data}.\n\nLembrando também que essa ata pode ser utilizada para justificar sua ausência no trabalho, caso necessário.\n\nQualquer dúvida, pode me chamar 😊' },
  { id: 'cs-docs-contrato', titulo: 'Documentos para o contrato', categoria: 'Documentos', atalho: 'docscontrato', etapas: ['inicial'], texto: 'Oi, {nome}! Tudo bem? 😊\n\nPara elaborarmos o seu contrato e darmos andamento ao seu caso, preciso que você nos encaminhe, por gentileza:\n\n📍 Documento pessoal com foto, podendo ser RG ou CNH\n\n📍 CPF, caso não conste no documento enviado\n\n📍 Comprovante de residência atualizado\n\nNa sequência enviaremos a lista de documentos necessários e já iniciaremos o processo. 😊\n\nFicamos no aguardo. 🩵\n\n*Equipe CS Advocacia*\ncarolinasantos.com.br' },
  { id: 'cs-docs-trabalhista', titulo: 'Documentos do caso trabalhista', categoria: 'Documentos', atalho: 'docstrabalhista', etapas: ['documentos'], texto: 'Oi, {nome}! Tudo bem? 😊\n\nPara darmos andamento ao seu caso trabalhista com mais segurança, preciso que você nos encaminhe alguns documentos e informações importantes.\n\nPeço, por gentileza, que os documentos sejam enviados em *PDF*, sempre que possível. Caso não tenha algum deles, não tem problema, é só nos avisar, tá bem?\n\n📄 *DOCUMENTOS NECESSÁRIOS*\n\n📍 Carteira de Trabalho — CTPS, principalmente as páginas do contrato e anotações importantes\n📍 Contrato de trabalho, se houver\n📍 Recibos de pagamento, holerites ou contracheques do período trabalhado\n📍 Extrato do FGTS\n📍 Termo de Rescisão do Contrato de Trabalho — TRCT, caso tenha recebido\n📍 Comprovante de aviso-prévio, se houver\n📍 Guias do seguro-desemprego, se tiver recebido\n📍 Conversas, mensagens, e-mails, fotos, vídeos ou qualquer prova relacionada ao trabalho, se houver\n\n📝 *INFORMAÇÃO IMPORTANTE*\n\nPor gentileza, nos informe também se há testemunhas que possam confirmar a situação vivenciada no trabalho.\n\nAssim que recebermos os documentos e essa informação, conseguiremos analisar tudo com mais atenção e dar continuidade aos próximos passos do seu atendimento.\n\nQualquer dúvida, estamos à disposição para te auxiliar, tá bem? 😊\n\n*Equipe CS Advocacia*\ncarolinasantos.com.br' },
  { id: 'cs-docs-curto', titulo: 'Documentos para contrato (curto)', categoria: 'Documentos', atalho: 'rgcpf', texto: '📥📄 Vamos dar seguimento ao início da sua ação e, para que eu possa elaborar o seu contrato, peço, por gentileza, que me encaminhe os seguintes documentos:\n\n- RG;\n- CPF;\n- Comprovante de residência atualizado.\n\nQualquer dúvida, fico à disposição para te auxiliar, tá bem?\n\nFico no aguardo 🩵' },
  { id: 'cs-fora-horario', titulo: 'Fora do horário de atendimento', categoria: 'Geral', atalho: 'forahorario', texto: 'Agradecemos seu contato! Deixe sua mensagem que, assim que possível, entraremos em contato.\n\nAtenciosamente,\n\nEquipe CS Advocacia ⚖️😊\n\nHorário de atendimento: das 9h às 18h' },
  { id: 'cs-lembrete-consulta', titulo: 'Lembrete da consulta de hoje', categoria: 'Agendamento', atalho: 'lembreteconsulta', texto: 'Oi, {nome}! Bom dia 😊\n\nPassando para lembrar que:\n\n📆 Sua consulta está confirmada para hoje, às {hora}. ✅\n\nCaso precise fazer alguma alteração, pedimos a gentileza de nos avisar com pelo menos 1 hora de antecedência.\n\nEstamos te aguardando!\n\nEquipe CS Advocacia\ncarolinasantos.com.br' },
].map((r) => ({ ...r, padrao: true }) as QuickReply);

export const emptySaved: SavedReplies = { itens: [], ocultas: [] };

/** Lista final: padrão (menos ocultas e substituídas) + mensagens da equipe, na ordem das categorias. */
export function mergeReplies(saved?: Partial<SavedReplies>): QuickReply[] {
  const itens = saved?.itens ?? [];
  const ocultas = new Set(saved?.ocultas ?? []);
  const own = new Map(itens.map((r) => [r.id, r]));
  const base = DEFAULT_REPLIES.filter((r) => !ocultas.has(r.id)).map((r) => own.get(r.id) ?? r);
  const extra = itens.filter((r) => !DEFAULT_REPLIES.some((d) => d.id === r.id));
  const order = (c: ReplyCategory) => REPLY_CATEGORIES.indexOf(c);
  return [...base, ...extra].map((r, i) => ({ r, i })).sort((a, b) => order(a.r.categoria) - order(b.r.categoria) || a.i - b.i).map((x) => x.r);
}

/** Troca as variáveis conhecidas pelos dados do cliente. Campos livres (ex.: {data}) ficam para a atendente preencher. */
export function fillReply(texto: string, c: Pick<Conversa, 'nome' | 'atendimento' | 'documentos'>): string {
  const faltantes = c.documentos.filter((d) => !d.recebido).map((d) => d.nome);
  const values: Record<string, string> = {
    nome: c.nome.split(' ')[0] ?? c.nome,
    nome_completo: c.nome,
    documentos_faltantes: faltantes.length ? faltantes.join(', ') : 'nenhum documento pendente',
    atendimento: c.atendimento,
  };
  const primeiro = values['nome']?.trim() ?? '';
  // Sem nome conhecido: tira {nome} e a vírgula ao redor, sem deixar a frase quebrada.
  const base = primeiro && !/^novo contato$/i.test(c.nome.trim())
    ? texto
    : texto
        .replace(/\{nome\}, (\p{Ll})/gu, (_a, l: string) => l.toUpperCase())
        .replace(/ ?, \{nome\}([.!?,])/g, '$1')
        .replace(/\{nome\}([.!?]) ?/g, '')
        .replace(/\{nome\} ?/g, '');
  return base.replace(/\{([a-z_]+)\}/gi, (all, key: string) => values[key.toLowerCase()] ?? all);
}

/** Campos entre chaves que ainda precisam ser preenchidos antes de enviar. */
export function pendingFields(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([^{}\n]{1,40})\}/g)].map((m) => m[1]!))];
}

/** Até `limit` sugestões para a conversa: primeiro o que combina com a última mensagem, depois com a etapa. */
export function suggestedReplies(c: Pick<Conversa, 'etapa' | 'mensagens' | 'documentos'>, replies: QuickReply[], limit = 4): QuickReply[] {
  const last = c.mensagens.at(-1);
  const first: string[] = [];
  if (last?.de === 'cliente' && last.arquivo) first.push('recebido');
  if (last?.de === 'cliente' && /obrigad/i.test(last.texto)) first.push('obrigada');
  const picked = [
    ...first.map((id) => replies.find((r) => r.id === id)),
    ...replies.filter((r) => r.etapas?.includes(c.etapa)),
  ].filter((r): r is QuickReply => Boolean(r));
  const unique = picked.filter((r, i) => picked.findIndex((x) => x.id === r.id) === i);
  const withoutUseless = unique.filter((r) => r.id !== 'faltam' || c.documentos.some((d) => !d.recebido));
  return withoutUseless.slice(0, limit);
}

/** Busca por título, atalho ou texto, sem diferenciar acentos e maiúsculas. Atalho exato vem primeiro. */
export function searchReplies(replies: QuickReply[], query: string): QuickReply[] {
  const q = normalized(query.replace(/^\//, ''));
  if (!q) return replies;
  const score = (r: QuickReply) => {
    const atalho = normalized(r.atalho);
    if (atalho === q) return 0;
    if (atalho.startsWith(q)) return 1;
    if (normalized(r.titulo).includes(q)) return 2;
    if (normalized(r.texto).includes(q)) return 3;
    return 9;
  };
  return replies.map((r) => ({ r, s: score(r) })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s).map((x) => x.r);
}

export function cleanShortcut(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
}

/** Valida a mensagem antes de salvar. Devolve a lista de problemas (vazia = ok). */
export function validateReply(reply: Pick<QuickReply, 'id' | 'titulo' | 'texto' | 'atalho'>, all: QuickReply[]): string[] {
  const errors: string[] = [];
  if (!reply.titulo.trim()) errors.push('Dê um nome para a mensagem.');
  if (!reply.texto.trim()) errors.push('Escreva o texto da mensagem.');
  if (reply.texto.length > 1500) errors.push('O texto pode ter até 1.500 caracteres.');
  if (!reply.atalho) errors.push('Defina um atalho, ex.: /bomdia.');
  else if (all.some((r) => r.id !== reply.id && r.atalho === reply.atalho)) errors.push(`O atalho /${reply.atalho} já está em uso.`);
  return errors;
}

export function upsertReply(saved: SavedReplies, reply: QuickReply): SavedReplies {
  const itens = saved.itens.some((r) => r.id === reply.id) ? saved.itens.map((r) => (r.id === reply.id ? reply : r)) : [...saved.itens, reply];
  return { ...saved, itens, ocultas: saved.ocultas.filter((id) => id !== reply.id) };
}

export function removeReply(saved: SavedReplies, id: string): SavedReplies {
  const isDefault = DEFAULT_REPLIES.some((r) => r.id === id);
  return { itens: saved.itens.filter((r) => r.id !== id), ocultas: isDefault ? [...new Set([...saved.ocultas, id])] : saved.ocultas };
}

/** Volta uma mensagem padrão ao texto original. */
export function restoreDefault(saved: SavedReplies, id: string): SavedReplies {
  return { itens: saved.itens.filter((r) => r.id !== id), ocultas: saved.ocultas.filter((x) => x !== id) };
}
