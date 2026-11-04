// Lista fechada das operações que o Manager ADV pode fazer no ProJuris. O cliente HTTP só aceita um id desta
// lista, nunca um caminho livre. Não há (e não deve haver) operação para apagar, ler arquivos ou documentos,
// financeiro, horas, comentários, solicitações, criar ou alterar tarefas, audiências e atendimentos, nem para
// usuários, perfis, configurações, webhooks ou notificações, mesmo que a API permita.
// Atualização cadastral autorizada: apenas pessoa e seus contatos, com conferência no Manager.

export interface OperacaoProjuris {
  metodo: 'GET' | 'POST' | 'PUT';
  /** Caminho relativo a /adv-service/, com {parametro} numérico. */
  caminho: string;
  /** POST de consulta não grava nada: só filtra. */
  somenteLeitura: boolean;
  descricao: string;
}

export const OPERACOES_PROJURIS = {
  'tipo.consulta': { metodo: 'GET', caminho: 'tipo', somenteLeitura: true, descricao: 'Consultas tipo (ex.: situações de processo)' },
  'pessoa.obter': { metodo: 'GET', caminho: 'pessoa/{codigo}', somenteLeitura: true, descricao: 'Dados de uma pessoa' },
  'pessoa.atualizar': { metodo: 'PUT', caminho: 'pessoa', somenteLeitura: false, descricao: 'Atualização cadastral da pessoa autorizada pela equipe' },
  'pessoa.telefoneAtualizar': { metodo: 'PUT', caminho: 'pessoa/{codigo}/telefone', somenteLeitura: false, descricao: 'Atualização de telefone cadastrado' },
  'pessoa.emailAtualizar': { metodo: 'PUT', caminho: 'pessoa/{codigo}/email', somenteLeitura: false, descricao: 'Atualização de e-mail cadastrado' },
  'pessoa.enderecoAtualizar': { metodo: 'PUT', caminho: 'pessoa/{codigo}/endereco', somenteLeitura: false, descricao: 'Atualização de endereço cadastrado' },
  'pessoa.consulta': { metodo: 'GET', caminho: 'pessoa/consulta', somenteLeitura: true, descricao: 'Busca por nome, e-mail ou CPF/CNPJ' },
  'pessoa.consultaCompleta': { metodo: 'POST', caminho: 'pessoa/consulta-completa', somenteLeitura: true, descricao: 'Busca com dados completos (telefones)' },
  'processo.consultaCompleta': { metodo: 'POST', caminho: 'processo/consulta-completa', somenteLeitura: true, descricao: 'Processos por envolvido e situação' },
  'processo.andamentos': { metodo: 'GET', caminho: 'processo/{codigo}/andamento/consulta', somenteLeitura: true, descricao: 'Andamentos de um processo' },
  'tarefa.calendario': { metodo: 'POST', caminho: 'tarefa/calendario/consulta-sem-paginacao', somenteLeitura: true, descricao: 'Agenda (compromissos, audiências e prazos), só leitura' },
  'tarefa.tipos': { metodo: 'GET', caminho: 'tarefa-tipo/consulta', somenteLeitura: true, descricao: 'Tipos de tarefa/compromisso cadastrados' },
  'tarefa.compromissoConsulta': { metodo: 'POST', caminho: 'tarefa/calendario/consulta-sem-paginacao-compromisso', somenteLeitura: true, descricao: 'Agenda de compromissos, só leitura' },
  'tarefa.compromissoObter': { metodo: 'GET', caminho: 'tarefa-compromisso/{codigo}', somenteLeitura: true, descricao: 'Um compromisso pelo código' },
  // Migração da agenda autorizada pela Dra. Carolina (04/11/2026): Compromisso — Visualizar, Inserir e
  // Alterar ativados no ProJuris; Excluir permanece desativado e proibido aqui. Sem retry automático de escrita.
  'tarefa.compromissoCriar': { metodo: 'POST', caminho: 'tarefa-compromisso', somenteLeitura: false, descricao: 'Criação de compromisso (migração da agenda)' },
  // Formato confirmado contra a API real em 04/11/2026: o PUT recebe o json_TarefaCompromissoEventoWs
  // DIRETO (sem o envelope da criação); com envelope a API responde 500.
  'tarefa.compromissoAlterar': { metodo: 'PUT', caminho: 'tarefa-compromisso', somenteLeitura: false, descricao: 'Alteração de compromisso (remarcação autorizada)' },
  // Conclusão pelo endpoint dedicado (swagger.json oficial: PUT sem corpo, resposta 204). Excluir permanece proibido.
  'tarefa.compromissoConcluir': { metodo: 'PUT', caminho: 'tarefa/compromisso/{codigo}', somenteLeitura: false, descricao: 'Conclusão de compromisso (cancelamento autorizado)' },
} as const satisfies Record<string, OperacaoProjuris>;

export type IdOperacaoProjuris = keyof typeof OPERACOES_PROJURIS;

/** Monta o caminho da operação; só aceita parâmetros numéricos positivos (códigos do ProJuris). */
export function caminhoOperacao(id: IdOperacaoProjuris, parametros: Record<string, number> = {}): string {
  const op: OperacaoProjuris | undefined = (OPERACOES_PROJURIS as Record<string, OperacaoProjuris>)[id];
  if (!op) throw new Error('Operação do ProJuris não permitida.');
  return op.caminho.replace(/\{(\w+)\}/g, (_, nome: string) => {
    const valor = parametros[nome];
    if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) throw new Error('Parâmetro inválido para o ProJuris.');
    return String(valor);
  });
}
