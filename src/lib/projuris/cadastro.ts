export type RegistroCadastro = Record<string, unknown>;
export const CAMPOS_CADASTRO = {
  nomePessoa: 'Nome completo', razaoSocial: 'Razão social', cpfCnpj: 'CPF / CNPJ',
  nomePai: 'Nome do pai', nomeMae: 'Nome da mãe', naturalidade: 'Naturalidade',
  nacionalidade: 'Nacionalidade', areaAtuacao: 'Área de atuação', qualificacao: 'Qualificação',
  observacaoGeral: 'Observações', inscricaoMunicipal: 'Inscrição municipal', inscricaoEstadual: 'Inscrição estadual',
} as const;
export type CampoCadastro = keyof typeof CAMPOS_CADASTRO;
export const CAMPOS_ENDERECO = {
  cepEndereco: 'CEP', logradouroEndereco: 'Logradouro', numeroEndereco: 'Número',
  complementoEndereco: 'Complemento', bairroEndereco: 'Bairro', descricaoEndereco: 'Descrição',
} as const;
export type AlteracaoCadastro =
  | { tipo: 'cadastro'; campo: CampoCadastro; valor: string }
  | { tipo: 'telefone'; codigo: number; valor: string }
  | { tipo: 'email'; codigo: number; valor: string }
  | { tipo: 'endereco'; codigo: number; campo: keyof typeof CAMPOS_ENDERECO; valor: string };

export const registroCadastro = (v: unknown): RegistroCadastro => v && typeof v === 'object' && !Array.isArray(v) ? v as RegistroCadastro : {};
export function vinculosConfirmados(casos: { id: string; dados: unknown }[]): { id: string; codigo: number }[] {
  return casos.flatMap(r => {
    const v = registroCadastro(registroCadastro(registroCadastro(r.dados)['agenteAna'])['vinculoProjuris']);
    const codigo = v['codigoPessoa'];
    return v['status'] === 'confirmado' && typeof codigo === 'number' && Number.isSafeInteger(codigo) && codigo > 0 ? [{ id: r.id, codigo }] : [];
  });
}
export function colecaoCadastro(r: RegistroCadastro, grupo: string, lista: string): RegistroCadastro[] {
  const v = registroCadastro(r[grupo])[lista];
  return Array.isArray(v) ? v.map(registroCadastro) : [];
}

/** Credenciais técnicas e dados bancários não são parte da ficha entregue ao navegador. */
export function cadastroVisivel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(cadastroVisivel);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !/senha|password|token|autenticacao|arrendatario|teste|dadosBancarios|trackView/i.test(k)).map(([k, x]) => [k, cadastroVisivel(x)]));
  return v;
}

export function prepararAlteracao(atual: RegistroCadastro, a: AlteracaoCadastro) {
  if (a.tipo === 'cadastro') {
    if (!(a.campo in CAMPOS_CADASTRO)) throw new Error('Campo não editável.');
    return { operacao: 'pessoa.atualizar' as const, corpo: { ...atual, [a.campo]: a.valor }, valorAtual: String(atual[a.campo] ?? '') };
  }
  if (a.tipo === 'telefone') {
    const r = colecaoCadastro(atual, 'pessoaTelefonesWs', 'pessoaTelefoneWs').find(r => r['codigoPessoaTelefone'] === a.codigo);
    if (!r) throw new Error('Telefone não encontrado.');
    const telefone = registroCadastro(r['telefone']);
    return { operacao: 'pessoa.telefoneAtualizar' as const, corpo: { ...r, telefone: { ...telefone, numeroTelefone: a.valor } }, valorAtual: String(telefone['numeroTelefone'] ?? '') };
  }
  if (a.tipo === 'email') {
    const r = colecaoCadastro(atual, 'pessoaEmailsWs', 'pessoaEmailWs').find(r => r['codigoEmail'] === a.codigo);
    if (!r) throw new Error('E-mail não encontrado.');
    return { operacao: 'pessoa.emailAtualizar' as const, corpo: { ...r, email: a.valor }, valorAtual: String(r['email'] ?? '') };
  }
  if (!(a.campo in CAMPOS_ENDERECO)) throw new Error('Campo não editável.');
  const r = colecaoCadastro(atual, 'pessoaEnderecosWs', 'pessoaEnderecoWs').find(r => r['codigoPessoaEndereco'] === a.codigo);
  if (!r) throw new Error('Endereço não encontrado.');
  const endereco = registroCadastro(r['enderecoWs']);
  return { operacao: 'pessoa.enderecoAtualizar' as const, corpo: { ...r, enderecoWs: { ...endereco, [a.campo]: a.valor } }, valorAtual: String(endereco[a.campo] ?? '') };
}