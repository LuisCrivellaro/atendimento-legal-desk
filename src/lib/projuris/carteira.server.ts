import { projuris, type ClienteProjuris } from './cliente.server';
import { criarConsultasProjuris } from './consultas.server';
import { processoDe, registros, totalRegistros } from './mapeamento';
import { acaoDoProcesso, clienteDiretorioDe, nomeClienteProjuris, pertenceCoorte, type ClienteProjurisDiretorio } from './diretorio';

export type RegistroPJ = Record<string, unknown>;
const CHAVES_PROCESSO = ['processoDadosComunsType', 'processoConsultaCompleta', 'processoConsulta', 'processos', 'processoWs'];

/** Leitura paginada completa ou falha explícita: nunca apresenta lote truncado como completo. */
async function paginas(cliente: Pick<ClienteProjuris, 'chamar'>, processos: boolean): Promise<RegistroPJ[]> {
  const todos = new Map<number, RegistroPJ>();
  for (let pagina = 0; pagina < 200; pagina++) {
    const raw = processos
      ? await cliente.chamar('processo.consultaCompleta', { consulta: { pagina, 'quan-registros': 100 }, corpo: {} })
      : await cliente.chamar('pessoa.consulta', { consulta: { pagina, 'quan-registros': 100 } });
    const chaves = processos ? CHAVES_PROCESSO : ['pessoaConsulta'];
    const lote = registros(raw, chaves);
    const antes = todos.size;
    for (const r of lote) {
      const id = Number(r[processos ? 'codigoProcesso' : 'codigoPessoa']);
      if (Number.isSafeInteger(id) && id > 0) todos.set(id, r);
    }
    if (todos.size >= totalRegistros(raw, chaves) || !lote.length) return [...todos.values()];
    if (todos.size === antes) throw new Error('Paginação do ProJuris sem avanço.');
  }
  throw new Error('Consulta excedeu o limite de páginas; resultado não apresentado como completo.');
}

export async function carregarCarteira(cliente: Pick<ClienteProjuris, 'chamar'> = projuris) {
  const [pessoas, processos, ativo] = await Promise.all([paginas(cliente, false), paginas(cliente, true), criarConsultasProjuris(cliente).codigoSituacaoAtivo()]);
  const porPessoa = new Map<number, RegistroPJ[]>();
  for (const r of processos) {
    const p = processoDe(r);
    if (!p) continue;
    for (const e of p.envolvidos.filter(e => e.cliente)) {
      const lista = porPessoa.get(e.codigoPessoa) ?? [];
      if (!lista.some(x => x['codigoProcesso'] === p.codigo)) lista.push(r);
      porPessoa.set(e.codigoPessoa, lista);
    }
  }
  let semData = 0;
  const lista: ClienteProjurisDiretorio[] = [];
  const nomes = new Map<number, string>();
  for (const r of pessoas) {
    const c = clienteDiretorioDe(r);
    if (!c) continue;
    const ativos = (porPessoa.get(c.codigo) ?? []).filter(p => processoDe(p)?.codigoSituacao === ativo);
    const acoes = [...new Set(ativos.map(acaoDoProcesso).filter((a): a is 'RT' | 'AC' => !!a))];
    const nomeExibicao = nomeClienteProjuris(c.codigo, c.nome, acoes);
    if (ativos.length) nomes.set(c.codigo, nomeExibicao);
    if (!c.incluidoEm) { semData++; continue; }
    if (pertenceCoorte(c) && ativos.length) lista.push({ ...c, nomeExibicao, acoes: acoes.join('/'), processosAtivos: ativos.length });
  }
  return { lista, porPessoa, nomes, semData, totalPessoas: pessoas.length, em: Date.now() };
}

let cache: Awaited<ReturnType<typeof carregarCarteira>> | undefined;
let emCurso: Promise<Awaited<ReturnType<typeof carregarCarteira>>> | undefined;
export function invalidarCarteira() { cache = undefined; }
export async function carteiraProjuris(atualizar = false) {
  if (!atualizar && cache && Date.now() - cache.em < 10 * 60000) return cache;
  emCurso ??= carregarCarteira().then(c => { cache = c; return c; }).finally(() => { emCurso = undefined; });
  return emCurso;
}