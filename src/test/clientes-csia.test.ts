import { describe, expect, it } from 'vitest';
import { acaoDoProcesso, dataCadastro, nomeClienteProjuris, pertenceCoorte } from '@/lib/projuris/diretorio';
import { carregarCarteira } from '@/lib/projuris/carteira.server';
import { prepararAlteracao, cadastroVisivel, vinculosConfirmados } from '@/lib/projuris/cadastro';
import { atualizarCadastroVerificado, revisaoCadastro } from '@/lib/projuris/cadastro.server';
import { criarClienteProjuris, type ClienteProjuris } from '@/lib/projuris/cliente.server';

describe('Clientes CS.IA', () => {
  it('inclui cadastro em 01/01/2025 e exclui anteriores ou sem data', () => {
    expect(pertenceCoorte({ incluidoEm: dataCadastro('2025-01-01') })).toBe(true);
    expect(pertenceCoorte({ incluidoEm: dataCadastro('2024-12-31') })).toBe(false);
    expect(pertenceCoorte({ incluidoEm: dataCadastro('2025-02-30') })).toBe(false);
    expect(pertenceCoorte({ incluidoEm: null })).toBe(false);
  });
  it('data/hora de cadastro usa São Paulo na fronteira de ano', () => {
    expect(dataCadastro(Date.parse('2025-01-01T02:59:59Z'))).toBe('2024-12-31');
    expect(dataCadastro(Date.parse('2025-01-01T03:00:00Z'))).toBe('2025-01-01');
  });
  it('nomenclatura usa o número identificador do processo com RT ou AC', () => {
    const rt = (id: string) => ({ identificador: id, assunto: 'Reclamação Trabalhista', codigoProcesso: 999 });
    const ac = (id: string) => ({ identificador: id, assunto: 'Indenizatória', codigoProcesso: 888 });
    expect(nomeClienteProjuris('Luis Filipe', [rt('PRO.0000034')]).nome).toBe('RT - 00034 - LUIS FILIPE');
    expect(nomeClienteProjuris('Simone Aparecida Souza', [ac('PRO.0000230')]).nome).toBe('AC - 00230 - SIMONE APARECIDA SOUZA');
    expect(nomeClienteProjuris('Elivania Souza', [rt('PRO.0000114'), ac('PRO.0000150')]).nome).toBe('RT - 00114 / AC - 00150 - ELIVANIA SOUZA');
  });
  it('nunca usa o ID interno do ProJuris e sinaliza número faltando', () => {
    const r = nomeClienteProjuris('Ana Lima', [{ assunto: 'Reclamação Trabalhista', codigoProcesso: 12345 }]);
    expect(r.nome).toBe('ANA LIMA');
    expect(r.pendencia).toMatch(/número identificador/);
    expect(r.nome).not.toContain('12345');
  });
  it('classificação não transforma justiça estadual desconhecida em AC', () => {
    expect(acaoDoProcesso({ tipoJustica: { valor: 'Justiça do Trabalho' } })).toBe('RT');
    expect(acaoDoProcesso({ area: { valor: 'Cível' } })).toBe('AC');
    expect(acaoDoProcesso({ tipoJustica: { valor: 'Justiça dos Estados' } })).toBeUndefined();
  });
  it('nomes de conversas usam apenas código de vínculo confirmado, nunca nomes iguais ou vínculo pendente', () => {
    expect(vinculosConfirmados([
      { id: 'confirmado', dados: { nome: 'Mesmo nome', agenteAna: { vinculoProjuris: { codigoPessoa: 114, status: 'confirmado' } } } },
      { id: 'pendente', dados: { nome: 'Mesmo nome', agenteAna: { vinculoProjuris: { codigoPessoa: 230, status: 'pendente' } } } },
      { id: 'sem-vinculo', dados: { nome: 'Mesmo nome' } },
    ])).toEqual([{ id: 'confirmado', codigo: 114 }]);
  });
  it('importa só coorte com processo ativo e flagCliente; relaciona por ID e guarda outros processos', async () => {
    const pessoas = [1, 2, 3, 4, 5].map(codigoPessoa => ({ codigoPessoa, nome: 'Mesmo nome', dtInclusao: codigoPessoa === 2 ? '2024-12-31' : '2025-01-01' }));
    const processo = (id: number, pessoa: number, ativo: boolean, cliente: boolean, area = 'Trabalhista') => ({ codigoProcesso: id, identificador: `PRO.${String(id).padStart(7, '0')}`, area: { valor: area }, situacaoProcesso: { chave: ativo ? 7 : 9 }, processoEnvolvidoSimplificadoWs: [{ codigoPessoaEnvolvido: pessoa, flagCliente: cliente }] });
    const chamar = (async (id: string) => id === 'tipo.consulta' ? [{ chave: 7, valor: 'Ativo' }] : id === 'pessoa.consulta' ? { totalRegistros: 5, pessoaConsulta: pessoas } : { totalRegistros: 6, processoDadosComunsType: [processo(91, 1, true, true), processo(92, 1, true, true, 'Cível'), processo(93, 1, false, true), processo(94, 2, true, true), processo(95, 3, false, true), processo(96, 4, true, false)] }) as ClienteProjuris['chamar'];
    const c = await carregarCarteira({ chamar });
    expect(c.lista.map(p => [p.codigo, p.nomeExibicao, p.processosAtivos])).toEqual([[1, 'RT - 00091 / AC - 00092 - MESMO NOME', 2]]);
    expect(c.porPessoa.get(1)?.length).toBe(3);
  });
  it('preserva os demais campos no PUT cadastral e nos contatos', () => {
    const atual = { codigoPessoa: 114, nomePessoa: 'Nome anterior', qualificacao: 'Intacta', pessoaTelefonesWs: { pessoaTelefoneWs: [{ codigoPessoaTelefone: 8, principal: true, telefone: { numeroTelefone: '11999990000', codigoTelefone: 9 } }] } };
    expect(prepararAlteracao(atual, { tipo: 'cadastro', campo: 'nomePessoa', valor: 'Elivania Souza' }).corpo).toEqual({ ...atual, nomePessoa: 'Elivania Souza' });
    expect(prepararAlteracao(atual, { tipo: 'telefone', codigo: 8, valor: '11999991111' }).corpo).toEqual({ codigoPessoaTelefone: 8, principal: true, telefone: { numeroTelefone: '11999991111', codigoTelefone: 9 } });
  });
  it('não expõe credenciais técnicas nem dados bancários na ficha', () => {
    expect(cadastroVisivel({ nomePessoa: 'Cliente', senhaProcesso: 'sigilosa', dadosBancarios: {}, interno: { testeValorAutenticacaoSessionView: 'sigilosa', assunto: 'Cível' } })).toEqual({ nomePessoa: 'Cliente', interno: { assunto: 'Cível' } });
  });
  it('confirma edição por leitura posterior e recusa versão alterada', async () => {
    let r = { codigoPessoa: 114, nomePessoa: 'Nome anterior' };
    const chamadas: string[] = [];
    const cliente = criarClienteProjuris({ credenciais: () => ({ clientId: 'teste', clientSecret: 'teste' }), fetch: (async (url, init) => {
      if (String(url).includes('/auth/token')) return Response.json({ access_token: 'teste', expires_in: 900 });
      chamadas.push(init?.method ?? 'GET');
      if (init?.method === 'PUT') { r = JSON.parse(String(init.body)); return Response.json({ chave: 114 }); }
      return Response.json(r);
    }) as typeof fetch });
    const revisao = await revisaoCadastro(r);
    expect((await atualizarCadastroVerificado(114, revisao, { tipo: 'cadastro', campo: 'nomePessoa', valor: 'Elivania Souza' }, cliente))['nomePessoa']).toBe('Elivania Souza');
    expect(chamadas).toEqual(['GET', 'PUT', 'GET']);
    await expect(atualizarCadastroVerificado(114, revisao, { tipo: 'cadastro', campo: 'nomePessoa', valor: 'Outro nome' }, cliente)).rejects.toThrow('mudou');
    expect(chamadas.filter(x => x === 'PUT')).toHaveLength(1);
  });
  it('não repete PUT que falhou após envio', async () => {
    let writes = 0;
    const cliente = criarClienteProjuris({ credenciais: () => ({ clientId: 'teste', clientSecret: 'teste' }), fetch: (async (url, init) => {
      if (String(url).includes('/auth/token')) return Response.json({ access_token: 'teste', expires_in: 900 });
      if (init?.method === 'PUT') { writes++; return new Response(null, { status: 503 }); }
      return Response.json({ codigoPessoa: 114 });
    }) as typeof fetch });
    await expect(cliente.chamar('pessoa.atualizar', { corpo: { codigoPessoa: 114 } })).rejects.toThrow();
    expect(writes).toBe(1);
  });
});