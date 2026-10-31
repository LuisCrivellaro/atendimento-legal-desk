import { projuris, type ClienteProjuris } from './cliente.server';
import { prepararAlteracao, registroCadastro, type AlteracaoCadastro, type RegistroCadastro } from './cadastro';

export async function revisaoCadastro(r: RegistroCadastro) {
  const ordenado = (v: unknown): unknown => Array.isArray(v) ? v.map(ordenado) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordenado(x)])) : v;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(ordenado(r))));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const locks = new Set<number>();
export async function atualizarCadastroVerificado(codigo: number, revisao: string, alteracao: AlteracaoCadastro, cliente: Pick<ClienteProjuris, 'chamar'> = projuris) {
  if (locks.has(codigo)) throw new Error('Há outra alteração em andamento neste cadastro.');
  locks.add(codigo);
  try {
    const atual = registroCadastro(await cliente.chamar('pessoa.obter', { parametros: { codigo } }));
    if (atual['codigoPessoa'] !== codigo) throw new Error('Cadastro retornado não corresponde à pessoa selecionada.');
    if (await revisaoCadastro(atual) !== revisao) throw new Error('O cadastro mudou no ProJuris. Atualize a ficha antes de salvar.');
    const plano = prepararAlteracao(atual, alteracao);
    if (plano.valorAtual === alteracao.valor) return atual;
    await cliente.chamar(plano.operacao, { parametros: { codigo }, corpo: plano.corpo });
    const depois = registroCadastro(await cliente.chamar('pessoa.obter', { parametros: { codigo } }));
    if (depois['codigoPessoa'] !== codigo || prepararAlteracao(depois, alteracao).valorAtual !== alteracao.valor) throw new Error('Alteração enviada, mas não confirmada pelo ProJuris. Atualize a ficha e confira antes de tentar novamente.');
    return depois;
  } finally { locks.delete(codigo); }
}