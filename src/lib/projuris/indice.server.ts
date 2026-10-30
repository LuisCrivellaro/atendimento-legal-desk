import { criarConsultasProjuris } from './consultas.server';
import { identificarPorTelefone, indiceTelefonesPrincipais, type PessoaComTelefones } from './identificacao';
import { chaveTelefone } from './telefone';

export const VALIDADE_INDICE_MS = 30 * 60000;
/** Índice privado em memória; uma falha nunca publica índice parcial nem usa cache vencido. */
export function criarIndiceServidor(consultas = criarConsultasProjuris(), agora = Date.now) {
  let cache: { pessoas: Map<number, PessoaComTelefones>; indice: Map<string, number[]>; ate: number } | undefined;
  let carregando: Promise<void> | undefined;
  async function carregar() {
    const pessoas: PessoaComTelefones[] = [];
    let quantidade = 0;
    for (let pagina = 0; pagina < 1000; pagina++) {
      const lote = await consultas.pessoasCompletas(pagina, 100);
      pessoas.push(...lote.pessoas);
      quantidade += lote.pessoas.length;
      if (quantidade >= lote.total || lote.pessoas.length < 100) {
        cache = { pessoas: new Map(pessoas.map(p => [p.codigo, p])), indice: indiceTelefonesPrincipais(pessoas), ate: agora() + VALIDADE_INDICE_MS };
        return;
      }
    }
    throw new Error('Índice ProJuris incompleto.');
  }
  return async (telefone: string) => {
    const chave = chaveTelefone(telefone);
    if (!chave) return identificarPorTelefone(telefone, []);
    if (!cache || agora() >= cache.ate) {
      carregando ??= carregar().finally(() => { carregando = undefined; });
      await carregando;
    }
    const atual = cache;
    if (!atual) throw new Error('Índice ProJuris indisponível.');
    const candidatos = (atual.indice.get(chave) ?? []).flatMap(c => { const p = atual.pessoas.get(c); return p ? [p] : []; });
    return identificarPorTelefone(telefone, candidatos);
  };
}
export const identificarClienteProjuris = criarIndiceServidor();