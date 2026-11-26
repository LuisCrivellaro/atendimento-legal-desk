/**
 * BIBLIOTECA OFICIAL E OBRIGATÓRIA DE MENSAGENS — CS LAWYERS (versão 1, recebida em 26/11/2026).
 *
 * Textos determinísticos: a Anne nunca reescreve, resume, completa ou gera variações. A única alteração é trocar as
 * variáveis entre colchetes por dados reais e verificados (ver `renderizar.ts`). Faltou variável ou o texto não combina
 * com a situação real (ex.: "Bom dia" à tarde, "Hoje" sem horários hoje) → o envio é bloqueado.
 * Novas versões só por sênior/admin (`biblioteca.functions.ts`), guardadas com histórico na área de trabalho.
 * NÃO EDITAR ESTES TEXTOS sem uma nova versão oficial da advocacia (os testes de snapshot acusam qualquer mudança).
 */

export type IdTemplate =
  | 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07.1' | 'T07.2' | 'T07.3' | 'T08.1' | 'T08.2'
  | 'T09' | 'T10.1' | 'T10.2' | 'T11.1' | 'T11.2' | 'T12.1' | 'T12.2' | 'T12.3';

/**
 * ativo: usado automaticamente no gatilho integrado (quando compatível);
 * manual: só a equipe usa (texto pronto, sem envio automático);
 * aguardando_aprovacao: depende de decisão ou aprovação da advogada antes de qualquer uso automático.
 */
export type Ativacao = 'ativo' | 'manual' | 'aguardando_aprovacao';

/** Condições de compatibilidade verificadas antes do envio (ver `compatibilidade.ts`). */
export type Condicao =
  | 'manha'             // o texto diz "Bom dia": só antes das 12h (São Paulo)
  | 'consulta_hoje'     // consulta com recibo para hoje
  | 'reserva_confirmada'// reserva confirmada na agenda oficial
  | 'sem_link_reuniao'  // o texto não leva o link do Meet: só quando não há link a entregar
  | 'dois_horarios_hoje'
  | 'dois_horarios_amanha'
  | 'dois_horarios_mesmo_dia'
  | 'lead_consulta_gratuita'
  | 'versao_paga_autorizada'
  | 'cliente_ativo'
  | 'fora_expediente'
  | 'uma_vez_por_periodo'
  | 'presencial'
  | 'janela_09_18'
  | 'aprovado_advogada'
  | 'pericia_amanha'
  | 'caso_trabalhista'
  | 'acao_equipe';

export interface TemplateOficial {
  id: IdTemplate;
  titulo: string;
  versao: number;
  texto: string;
  gatilho: string;
  condicoes: Condicao[];
  /** Fonte oficial de cada variável. */
  fontes: Record<string, string>;
  ativacao: Ativacao;
  aprovacao: 'nenhuma' | 'advogada';
  /** Onde o gatilho está ligado no sistema (ou por que ainda não está). */
  integracao: string;
}

const NOME = 'cadastro real do cliente (vínculo confirmado ou nome informado e registrado no atendimento)';
const HORARIO = 'horário confirmado na agenda oficial (recibo)';
const LIVRES = 'horários efetivamente livres na agenda oficial, lidos antes do envio';
const PROCESSO = 'processo correto no ProJuris (vínculo confirmado)';
const AUDIENCIA = 'registro oficial da audiência no ProJuris, aprovado pela advogada';
const PERICIA = 'registro oficial da perícia no ProJuris, aprovado pela advogada';

export const TEMPLATES_OFICIAIS: Record<IdTemplate, TemplateOficial> = {
  T01: {
    id: 'T01', titulo: 'Lembrete de consulta no mesmo dia', versao: 1,
    texto: 'Oi, [nome]! Bom dia 😊\nPassando para lembrar que:\n📆 Sua consulta está confirmada para hoje, às [horário]. ✅\nCaso precise fazer alguma alteração, pedimos a gentileza de nos avisar com pelo menos 1 hora de antecedência.\nEstamos te aguardando!\nEquipe CS Advocacia\ncarolinasantos.com.br',
    gatilho: 'Consulta confirmada para o dia atual, no horário configurado para o lembrete.',
    condicoes: ['manha', 'consulta_hoje'], fontes: { '[nome]': NOME, '[horário]': HORARIO },
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Rotina do lembrete das 08:00 (lembrete-consulta.server.ts).',
  },
  T02: {
    id: 'T02', titulo: 'Confirmação de atendimento no mesmo dia', versao: 1,
    texto: 'Olá! Bom dia 😊\nPassando para confirmar o seu atendimento hoje às [horário] ✅, ok?\nEquipe CS Advocacia ⚖️',
    gatilho: 'Consulta agendada para hoje, aguardando confirmação de presença do cliente.',
    condicoes: ['manha', 'consulta_hoje'], fontes: { '[horário]': HORARIO },
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Confirmação de presença (padrão 2 h antes, configurável), quando enviada de manhã (confirmacao-consulta.ts).',
  },
  T03: {
    id: 'T03', titulo: 'Clientes ativos fora do horário comercial', versao: 1,
    texto: 'Agradecemos seu contato! 😊\nDeixe sua mensagem que, assim que possível, entraremos em contato.\nAtenciosamente,\nEquipe CS Advocacia ⚖️😊',
    gatilho: 'Cliente ativo envia mensagem fora do horário comercial; uma vez por período fora do expediente.',
    condicoes: ['cliente_ativo', 'fora_expediente', 'uma_vez_por_periodo'], fontes: {},
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Anne no modo Automático, só com a automação "Resposta fora do horário" ligada (processarAna).',
  },
  T04: {
    id: 'T04', titulo: 'Lembrete de audiência presencial', versao: 1,
    texto: 'Oi, [nome do cliente]! 😊\nEstamos passando para te lembrar da sua audiência, que será realizada PRESENCIALMENTE, no dia [data], às [horário] — [tipo da audiência / modalidade].\n📌 Processo: [número do processo]\n📌 Vara: [vara responsável]\n📍 Local da audiência:\n[Endereço completo]\n📌 Solicitamos que você compareça ao local com uma hora de antecedência, portando um documento oficial com foto.\n📌 Caso possua testemunha, pedimos que a informe sobre a data, horário e local da audiência, para que ela também possa se organizar com antecedência. Por gentileza, nos envie um print do aviso encaminhado à testemunha.\nQualquer dúvida, estou à disposição! 🩵\nEquipe CS Lawyers ⚖️',
    gatilho: 'Audiência presencial próxima, com informações verificadas e aprovadas pela advogada; entre 09h e 18h.',
    condicoes: ['presencial', 'janela_09_18', 'aprovado_advogada'],
    fontes: { '[nome do cliente]': NOME, '[data]': AUDIENCIA, '[horário]': AUDIENCIA, '[tipo da audiência / modalidade]': AUDIENCIA, '[número do processo]': PROCESSO, '[vara responsável]': PROCESSO, '[Endereço completo]': AUDIENCIA },
    ativacao: 'aguardando_aprovacao', aprovacao: 'advogada', integracao: 'Sem rotina automática: falta a antecedência configurada e a aprovação do lembrete pela advogada.',
  },
  T05: {
    id: 'T05', titulo: 'Solicitação de documentos pessoais para elaboração de contrato', versao: 1,
    texto: 'Oi, [nome]! Tudo bem? 😊\nPara elaborarmos o seu contrato e darmos andamento ao seu caso, preciso que você nos encaminhe, por gentileza:\n📍 Documento pessoal com foto, podendo ser RG ou CNH\n📍 CPF, caso não conste no documento enviado\n📍 Comprovante de residência atualizado\nNa sequência, enviaremos a lista de documentos necessários e já iniciaremos o processo. 😊\nFicamos no aguardo. 🩵\nEquipe CS Advocacia\ncarolinasantos.com.br',
    gatilho: 'Consulta realizada e elaboração do contrato autorizada pela equipe ("Trato feito").',
    condicoes: ['acao_equipe'], fontes: { '[nome]': NOME },
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Botão TRATO FEITO no Atendimento.',
  },
  T06: {
    id: 'T06', titulo: 'Reagendamento de consulta por imprevistos', versao: 1,
    texto: 'Oi, [nome]! Tudo bem? 😊\nFique tranquila, sabemos que imprevistos acontecem.\nEstou passando para reagendarmos sua consulta e garantir que você receba a orientação necessária sobre o seu caso com calma e atenção.\nHoje temos disponibilidade às [horário 1] ou às [horário 2].\nQual desses horários fica melhor para você?',
    gatilho: 'Cliente faltou (ausência registrada), pediu reagendamento, avisou que não poderá comparecer ou a equipe pediu reagendamento por imprevisto. Agenda oficial consultada antes.',
    condicoes: ['dois_horarios_hoje'], fontes: { '[nome]': NOME, '[horário 1]': LIVRES, '[horário 2]': LIVRES },
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Reagendamento conduzido pela Anne (secretaria digital), quando há dois horários livres hoje.',
  },
  'T07.1': {
    id: 'T07.1', titulo: 'Primeiro atendimento: consulta gratuita', versao: 1,
    texto: 'Olá, [nome]!\nSeja bem-vindo(a)! 😊\nVou te ajudar!\nNossa primeira consulta é on-line e gratuita.\nTemos horários amanhã, [dia da semana], às [horário 1] ou às [horário 2].\nO que fica melhor para você?',
    gatilho: 'Novo lead elegível para consulta gratuita, conforme as regras comerciais oficiais.',
    condicoes: ['lead_consulta_gratuita', 'dois_horarios_amanha'], fontes: { '[nome]': NOME, '[dia da semana]': 'calculado da data real dos horários', '[horário 1]': LIVRES, '[horário 2]': LIVRES },
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Primeira resposta da Anne a lead novo que já disse o nome, quando os dois horários são amanhã; senão vale a saudação aprovada anterior.',
  },
  'T07.2': {
    id: 'T07.2', titulo: 'Primeiro atendimento: consulta paga — 18 anos', versao: 1,
    texto: 'Olá, [nome]!\nSeja bem-vindo(a)! 😊\nVou te ajudar!\nNossa primeira consulta tem o valor de R$ 500,00, abaixo do valor previsto na Tabela da OAB, na qual você receberá todas as instruções necessárias para o seu caso e possíveis soluções para o seu problema, com a expertise de mais de 18 anos de experiência nacional e internacional na área de família.\nVocê recebe ainda o valor de volta caso haja a contratação dos serviços necessários, ficando a consulta gratuita. ✅\n📆 Temos horários disponíveis na [dia] às [horário 1] ou [horário 2].\nO que fica melhor para você?',
    gatilho: 'Novo lead elegível para consulta paga, com esta versão comercial expressamente autorizada pela advogada.',
    condicoes: ['versao_paga_autorizada', 'dois_horarios_mesmo_dia'], fontes: { '[nome]': NOME, '[dia]': LIVRES, '[horário 1]': LIVRES, '[horário 2]': LIVRES },
    ativacao: 'aguardando_aprovacao', aprovacao: 'advogada', integracao: 'Bloqueado até a advogada escolher entre 07.2 e 07.3 e definir a elegibilidade para consulta paga.',
  },
  'T07.3': {
    id: 'T07.3', titulo: 'Primeiro atendimento: consulta paga — 20 anos', versao: 1,
    texto: 'Olá, [nome]!\nSeja bem-vindo(a)! 😊\nVou te ajudar!\nNossa primeira consulta tem o valor de R$ 500,00, abaixo do valor previsto na Tabela da OAB, na qual você receberá todas as instruções necessárias para o seu caso e possíveis soluções para o seu problema, com a expertise de mais de 20 anos de experiência nacional e internacional na área de família.\nVocê recebe ainda o valor de volta caso haja a contratação dos serviços necessários, ficando a consulta gratuita. ✅\n📆 Temos horários disponíveis na [dia] às [horário 1] ou [horário 2].\nO que fica melhor para você?',
    gatilho: 'Novo lead elegível para consulta paga, com esta versão comercial expressamente autorizada pela advogada.',
    condicoes: ['versao_paga_autorizada', 'dois_horarios_mesmo_dia'], fontes: { '[nome]': NOME, '[dia]': LIVRES, '[horário 1]': LIVRES, '[horário 2]': LIVRES },
    ativacao: 'aguardando_aprovacao', aprovacao: 'advogada', integracao: 'Bloqueado até a advogada escolher entre 07.2 e 07.3 e definir a elegibilidade para consulta paga.',
  },
  'T08.1': {
    id: 'T08.1', titulo: 'Agendamento confirmado', versao: 1,
    texto: 'Bom dia! 😊\n📍 Confirmado!\n📆 Sua consulta está agendada para [dia da semana], [data], às [horário]. ✅\nCaso haja alguma alteração, pedimos a gentileza de avisar com 1 hora de antecedência. 🙏🏻\nEquipe CS Advocacia ⚖️',
    gatilho: 'Consulta ou reagendamento efetivamente reservado e confirmado na agenda oficial.',
    condicoes: ['manha', 'reserva_confirmada', 'sem_link_reuniao'], fontes: { '[dia da semana]': 'calculado da data da reserva', '[data]': HORARIO, '[horário]': HORARIO },
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Reserva e remarcação pela Anne; à tarde, ou com link do Meet a entregar, vale a confirmação aprovada anterior (com link).',
  },
  'T08.2': {
    id: 'T08.2', titulo: 'Confirmação de agendamento', versao: 1,
    texto: 'Olá! 👋🏻\nTudo bem? 😊\n📍 Estamos passando para confirmar a sua consulta.\n📆 Agendada para hoje, [dia da semana], [data], às [horário]. ✅\nCaso haja alguma alteração, pedimos a gentileza de avisar com antecedência. 🙏🏻\nEquipe CS Advocacia\ncarolinasantos.com.br',
    gatilho: 'Consulta agendada para o dia atual, conforme a política de confirmação configurada.',
    condicoes: ['consulta_hoje'], fontes: { '[dia da semana]': 'calculado da data da reserva', '[data]': HORARIO, '[horário]': HORARIO },
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Confirmação de presença (padrão 2 h antes, configurável), quando enviada a partir do meio-dia (confirmacao-consulta.ts).',
  },
  T09: {
    id: 'T09', titulo: 'Checklist de documentos para reclamação trabalhista', versao: 1,
    texto: '⚖️ Nosso escritório CS Lawyers, carolinasantos.com.br, tem o maior prazer em atendê-lo. Vamos lá!\n📄 CHECKLIST — Documentos e Informações Importantes\nPara dar andamento corretamente na sua causa trabalhista, pedimos que nos envie os documentos e informações abaixo. Caso tenha dúvidas, estamos à disposição!\n✅ Documentos pessoais e de trabalho\nPor gentileza, envie cópias digitalizadas ou fotos legíveis dos seguintes documentos, se possível:\n\n* Documento de identidade (RG ou CNH);\n* Comprovante de residência atualizado;\n* CTPS (Carteira de Trabalho — todas as páginas que envolvam o contrato e anotações relevantes);\n* Contrato de trabalho (se houver);\n* Recibos ou holerites do período trabalhado;\n* Extrato da conta vinculada ao FGTS (Caixa Econômica Federal);\n* Termo de Rescisão do Contrato de Trabalho — TRCT (caso tenha recebido).\n\n📝 Informações importantes sobre a relação de trabalho\nResponda, por favor, com base na sua experiência no trabalho:\n\n* Um breve histórico da sua relação de trabalho (data de entrada, saída, motivo da saída etc.);\n* Como era a jornada de trabalho combinada e como era executada na prática?\n* Qual era sua atividade contratada e o que você realmente fazia no dia a dia?\n* Em algum momento você sentiu que sofreu tratamento inadequado, como:\n   * Forma de tratamento agressiva;\n   * Autoritarismo ou deboche;\n   * Desprezo ou preconceito;\n   * Situações de assédio moral (caso sim, descreva brevemente como foi).\n* Você tem filhos menores? Quantos? Qual a idade de cada um?\n* Recebia vale-transporte e/ou vale-alimentação? Se sim, informe os valores recebidos.\n\n📬 Importante: Você pode enviar os documentos e respostas por aqui mesmo, via WhatsApp.\nAgradecemos pela confiança! 🤝⚖️\nEstamos aqui para garantir seus direitos.\nEquipe CS Lawyers',
    gatilho: 'Cliente com caso trabalhista e solicitação documental autorizada pela equipe.',
    condicoes: ['caso_trabalhista', 'acao_equipe'], fontes: {},
    ativacao: 'manual', aprovacao: 'nenhuma', integracao: 'Botão "Enviar checklist trabalhista (T09)" no painel da Anne: a equipe confirma que o caso é trabalhista e autoriza; o servidor envia o texto exato com recibo e inclui os itens no checklist (checklist-trabalhista.functions.ts). Nunca por decisão da Anne.',
  },
  'T10.1': {
    id: 'T10.1', titulo: 'Instagram', versao: 1,
    texto: 'https://www.instagram.com/carolinasantoslawyer',
    gatilho: 'Cliente pede o Instagram da advocacia ou da doutora.',
    condicoes: [], fontes: {},
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Anne no modo Automático, antes do modelo (processarAna).',
  },
  'T10.2': {
    id: 'T10.2', titulo: 'LinkedIn', versao: 1,
    texto: 'https://www.linkedin.com/in/carolina-santos-654918254/',
    gatilho: 'Cliente pede o LinkedIn da doutora.',
    condicoes: [], fontes: {},
    ativacao: 'ativo', aprovacao: 'nenhuma', integracao: 'Anne no modo Automático, antes do modelo (processarAna).',
  },
  'T11.1': {
    id: 'T11.1', titulo: 'Comunicação de audiência', versao: 1,
    texto: 'Oi, [nome]! 😊\nEstamos entrando em contato para informar sobre a sua audiência.\n📆 Data: [data]\n⏰ Horário: [horário]\n📌 Modalidade: [presencial/online]\n📋 Tipo: [tipo de audiência]\n📌 Processo: [número]\n📌 Vara: [vara responsável]\n📍 Local / link da audiência:\n[Endereço ou link]\nPedimos que se organize para comparecer com antecedência e esteja com seus documentos pessoais em mãos.\nQualquer dúvida, estamos à disposição!\nEquipe CS Lawyers ⚖️',
    gatilho: 'Nova audiência identificada no ProJuris, com informações verificadas e comunicação aprovada pela advogada.',
    condicoes: ['aprovado_advogada'],
    fontes: { '[nome]': NOME, '[data]': AUDIENCIA, '[horário]': AUDIENCIA, '[presencial/online]': AUDIENCIA, '[tipo de audiência]': AUDIENCIA, '[número]': PROCESSO, '[vara responsável]': PROCESSO, '[Endereço ou link]': AUDIENCIA },
    ativacao: 'ativo', aprovacao: 'advogada', integracao: 'Rascunho para a revisora quando uma audiência entra pelo ProJuris; só sai depois da aprovação e com todos os campos preenchidos.',
  },
  'T11.2': {
    id: 'T11.2', titulo: 'Confirmação de audiência', versao: 1,
    texto: 'Oi, [nome]! Tudo bem? 😊\nPassando para confirmar que sua audiência está agendada:\n📆 Data: [data]\n⏰ Horário: [horário]\n📋 Tipo: [tipo da audiência]\n📌 Modalidade: [presencial/online]\n📍 Local: [endereço]\n📌 Processo: [número]\nPedimos que compareça com [antecedência] e leve um documento oficial com foto.\nPor gentileza, confirme o recebimento desta mensagem.\nEquipe CS Lawyers ⚖️',
    gatilho: 'Audiência válida, previamente verificada, cuja comunicação exige confirmação de recebimento.',
    condicoes: ['aprovado_advogada'],
    fontes: { '[nome]': NOME, '[data]': AUDIENCIA, '[horário]': AUDIENCIA, '[tipo da audiência]': AUDIENCIA, '[presencial/online]': AUDIENCIA, '[endereço]': AUDIENCIA, '[número]': PROCESSO, '[antecedência]': 'orientação aprovada pela advogada' },
    ativacao: 'aguardando_aprovacao', aprovacao: 'advogada', integracao: 'Sem rotina automática: falta a antecedência aprovada e a regra de quando pedir confirmação.',
  },
  'T12.1': {
    id: 'T12.1', titulo: 'Perícia agendada pelo Tribunal', versao: 1,
    texto: '📍 Atenção: Perícia Agendada pelo Tribunal!\n⚠️ Sua perícia foi marcada para:\n📆 Data: [data]\n⏰ Horário: [horário]\n📍 Endereço: [endereço completo]\n‼️⏰ Lembramos que você deve estar presente no local com 15 minutos de antecedência do horário agendado.\nObrigada! 😊\nEquipe CS Advocacia\ncarolinasantos.com.br',
    gatilho: 'Nova perícia identificada no ProJuris, com dados verificados e comunicação aprovada pela advogada.',
    condicoes: ['aprovado_advogada'], fontes: { '[data]': PERICIA, '[horário]': PERICIA, '[endereço completo]': PERICIA },
    ativacao: 'ativo', aprovacao: 'advogada', integracao: 'Rascunho para a revisora quando uma perícia entra pelo ProJuris; só sai depois da aprovação e com todos os campos preenchidos.',
  },
  'T12.2': {
    id: 'T12.2', titulo: 'Lembrete de perícia no dia seguinte', versao: 1,
    texto: '📍 Lembrete importante!\n⚠️ Sua perícia de [tipo de perícia] será amanhã, [data], às [horário].\n📍 Endereço: [endereço completo]. ✅\n‼️⏰ Lembramos que você deve estar presente no local com 15 minutos de antecedência do horário agendado.\nObrigada! 😊\nEquipe CS Advocacia\ncarolinasantos.com.br',
    gatilho: 'Perícia válida agendada para amanhã, previamente comunicada ao cliente.',
    condicoes: ['pericia_amanha', 'aprovado_advogada'], fontes: { '[tipo de perícia]': PERICIA, '[data]': PERICIA, '[horário]': PERICIA, '[endereço completo]': PERICIA },
    ativacao: 'aguardando_aprovacao', aprovacao: 'advogada', integracao: 'Sem rotina automática: falta a rotina diária de perícias comunicadas e a aprovação.',
  },
  'T12.3': {
    id: 'T12.3', titulo: 'Confirmação de data de perícia', versao: 1,
    texto: 'Oi, [nome]! Tudo bem? 😊\nPassando para confirmar os dados da sua perícia:\n📆 Data: [data]\n⏰ Horário: [horário]\n📍 Local: [endereço completo]\nPedimos que chegue com 15 minutos de antecedência, portando documento oficial com foto.\nPor gentileza, confirme o recebimento desta mensagem.\nEquipe CS Advocacia ⚖️',
    gatilho: 'Perícia válida cuja comunicação exige confirmação de recebimento.',
    condicoes: ['aprovado_advogada'], fontes: { '[nome]': NOME, '[data]': PERICIA, '[horário]': PERICIA, '[endereço completo]': PERICIA },
    ativacao: 'aguardando_aprovacao', aprovacao: 'advogada', integracao: 'Sem rotina automática: falta a regra de quando pedir confirmação e a aprovação.',
  },
};

export const IDS_TEMPLATES = Object.keys(TEMPLATES_OFICIAIS) as IdTemplate[];

/** Variáveis (com colchetes) usadas no texto. */
export function variaveisDoTexto(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\[[^\[\]\n]{1,60}\]/g)].map(m => m[0]))];
}

export function variaveisPermitidas(id: IdTemplate): string[] {
  return variaveisDoTexto(TEMPLATES_OFICIAIS[id].texto);
}

/** Todas as variáveis oficiais (para detectar campo não preenchido em qualquer texto). */
export const TODAS_VARIAVEIS = [...new Set(IDS_TEMPLATES.flatMap(variaveisPermitidas))];
