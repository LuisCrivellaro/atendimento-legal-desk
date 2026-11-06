// Consultas de leitura ao ProJuris, já filtradas pelas regras de processos.ts. Só no servidor.
// A ordem da API não é documentada: lê todas as páginas e ordena os movimentos públicos aqui.
import { projuris, type ClienteProjuris } from './cliente.server';
import { ErroProjuris } from './erros';
import { codigoSituacaoAtiva, pessoaDe, processoDe, registros, totalRegistros } from './mapeamento';
import { processosAtivosDoCliente, ultimosAndamentosPublicos, type AndamentoLegivel, type ProcessoPJ } from './processos';
import type { PessoaComTelefones } from './identificacao';

const CHAVES_PESSOA = ['pessoaConsultaCompleta', 'pessoaConsulta', 'pessoas', 'pessoaWs'];
const CHAVES_PROCESSO = ['processoConsultaCompleta', 'processoConsulta', 'processos', 'processoWs'];
const POR_PAGINA = 50;
const MAX_PAGINAS_PROCESSOS = 200;

const definido = <T>(v: T | undefined): v is T => v !== undefined;

export function criarConsultasProjuris(cliente: Pick<ClienteProjuris, 'chamar'> = projuris, agora: () => number = Date.now) {
  let situacaoAtiva: { codigo: number; ate: number } | undefined;

  /** Código da situação "Ativo" pela consulta tipo, sem número fixo; guardado por 6 horas. */
  async function codigoSituacaoAtivo(): Promise<number> {
    if (situacaoAtiva && agora() < situacaoAtiva.ate) return situacaoAtiva.codigo;
    const codigo = codigoSituacaoAtiva(await cliente.chamar('tipo.consulta', { consulta: { 'chave-tipo': 'processo-situacao' } }));
    if (!codigo) throw new ErroProjuris('resposta', 'Situação "Ativo" não encontrada nas consultas tipo do ProJuris.');
    situacaoAtiva = { codigo, ate: agora() + 6 * 3600000 };
    return codigo;
  }

  /** Uma página de pessoas com telefones (para o índice de telefones principais). */
  async function pessoasCompletas(pagina: number, quantidade = 100): Promise<{ pessoas: PessoaComTelefones[]; total: number }> {
    const raw = await cliente.chamar('pessoa.consultaCompleta', { consulta: { pagina, 'quan-registros': quantidade }, corpo: {} });
    const lote = registros(raw, CHAVES_PESSOA);
    const pessoas = lote.map(pessoaDe).filter(definido);
    if (pessoas.length !== lote.length) throw new ErroProjuris('resposta', 'Índice contém cadastro sem identificação válida.');
    return { pessoas, total: totalRegistros(raw, CHAVES_PESSOA) };
  }

  /** Processos ativos em que a pessoa é cliente. Confere de novo aqui, mesmo que a API já filtre. */
  async function processosAtivos(codigoPessoa: number): Promise<ProcessoPJ[]> {
    const ativo = await codigoSituacaoAtivo();
    const todos = new Map<number, ProcessoPJ>();
    let completa = false;
    for (let pagina = 0; pagina < MAX_PAGINAS_PROCESSOS; pagina++) {
      const raw = await cliente.chamar('processo.consultaCompleta', {
        consulta: { pagina, 'quan-registros': POR_PAGINA },
        corpo: { codigoPessoaEnvolvido: codigoPessoa, codigoSituacao: ativo },
      });
      const registrosPagina = registros(raw, CHAVES_PROCESSO);
      const lote = registrosPagina.map(processoDe).filter(definido);
      if (lote.length !== registrosPagina.length) throw new ErroProjuris('resposta', 'Processo sem identificação; consulta incompleta.');
      const antes = todos.size;
      for (const p of lote) todos.set(p.codigo, p);
      const informado = raw && typeof raw === 'object' && !Array.isArray(raw) && typeof (raw as Record<string, unknown>)['totalRegistros'] === 'number';
      if (informado ? todos.size >= totalRegistros(raw, CHAVES_PROCESSO) : !lote.length) { completa = true; break; }
      if (!lote.length || antes === todos.size) throw new ErroProjuris('resposta', 'Paginação de processos sem avanço.');
    }
    if (!completa) throw new ErroProjuris('resposta', 'Consulta de processos incompleta; nenhuma seleção será divulgada.');
    const unicos = [...todos.values()];
    return processosAtivosDoCliente(unicos, codigoPessoa, ativo);
  }

  /** As n últimas movimentações não privadas do processo. */
  async function ultimosAndamentos(codigoProcesso: number, n = 3): Promise<AndamentoLegivel[]> {
    const { lerTodosAndamentos } = await import('./base.server');
    return ultimosAndamentosPublicos(await lerTodosAndamentos(codigoProcesso, cliente), n);
  }

  /** Pessoas pela busca geral com o CPF (só leitura). A escolha exata fica em vinculo.ts. */
  async function pessoasPorCpf(cpf: string): Promise<{ codigo: number; nome: string; cpf?: string }[]> {
    const raw = await cliente.chamar('pessoa.consulta', { consulta: { 'filtro-geral': cpf.replace(/\D/g, ''), pagina: 0, 'quan-registros': 20 } });
    return registros(raw, ['pessoaConsulta', 'pessoas']).flatMap(r => {
      const codigo = Number(r['codigoPessoa']), nome = typeof r['nome'] === 'string' ? r['nome'].trim() : '';
      const doc = typeof r['cpfOuCnpj'] === 'string' ? r['cpfOuCnpj'] : undefined;
      return Number.isSafeInteger(codigo) && codigo > 0 && nome ? [{ codigo, nome, ...(doc ? { cpf: doc } : {}) }] : [];
    });
  }

  return { codigoSituacaoAtivo, pessoasCompletas, processosAtivos, ultimosAndamentos, pessoasPorCpf };
}
