import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { CAMPOS_CADASTRO, CAMPOS_ENDERECO, cadastroVisivel, registroCadastro } from './projuris/cadastro';
import type { AlteracaoCadastro } from './projuris/cadastro';

/** Clientes do ProJuris ao vivo (sênior/admin). Somente leitura. */
export const listarClientesProjuris = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ busca: z.string().max(120).default(''), pagina: z.number().int().min(0).max(1000).default(0), atualizar: z.boolean().default(false) }))
  .handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior'))
      return { ok: false as const, erro: 'Consulta ao ProJuris reservada à advogada sênior ou administração.' };
    const { ErroProjuris } = await import('./projuris/cliente.server');
    const { carteiraProjuris } = await import('./projuris/carteira.server');
    const { filtrarDiretorio } = await import('./projuris/diretorio');
    try {
      const cache = await carteiraProjuris(data.atualizar);
      const r = filtrarDiretorio(cache.lista, data.busca, data.pagina, 50);
      return { ok: true as const, ...r, totalProjuris: cache.lista.length, semData: cache.semData, atualizadoEm: new Date(cache.em).toISOString() };
    } catch (e) {
      const tipo = e instanceof ErroProjuris ? e.tipo : 'resposta';
      console.error('ProJuris clientes:', tipo, e instanceof ErroProjuris ? e.status : '');
      return { ok: false as const, erro: tipo === 'sem_permissao' ? 'O ProJuris não liberou a lista de pessoas para este acesso.' : tipo === 'configuracao' ? 'Chaves do ProJuris não salvas.' : 'Não foi possível consultar o ProJuris agora. Tente novamente.' };
    }
  });

export const obterClienteProjuris = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ codigo: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Acesso restrito à advogada sênior ou administração.');
    const { carteiraProjuris } = await import('./projuris/carteira.server');
    const { projuris } = await import('./projuris/cliente.server');
    const { revisaoCadastro } = await import('./projuris/cadastro.server');
    const carteira = await carteiraProjuris();
    const cliente = carteira.lista.find(c => c.codigo === data.codigo);
    if (!cliente) throw new Error('Cliente fora da carteira elegível.');
    const cadastro = registroCadastro(await projuris.chamar('pessoa.obter', { parametros: { codigo: data.codigo } }));
    if (cadastro['codigoPessoa'] !== data.codigo) throw new Error('Cadastro não confirmado pelo ProJuris.');
    return { cliente, cadastroJson: JSON.stringify(cadastroVisivel(cadastro)), processosJson: JSON.stringify(cadastroVisivel(carteira.porPessoa.get(data.codigo) ?? [])), revisao: await revisaoCadastro(cadastro) };
  });

const campo = z.enum(Object.keys(CAMPOS_CADASTRO) as [keyof typeof CAMPOS_CADASTRO, ...(keyof typeof CAMPOS_CADASTRO)[]]);
const enderecoCampo = z.enum(Object.keys(CAMPOS_ENDERECO) as [keyof typeof CAMPOS_ENDERECO, ...(keyof typeof CAMPOS_ENDERECO)[]]);
const alteracaoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('cadastro'), campo, valor: z.string().max(5000) }),
  z.object({ tipo: z.literal('telefone'), codigo: z.number().int().positive(), valor: z.string().regex(/^\+?[\d\s().-]{8,25}$/) }),
  z.object({ tipo: z.literal('email'), codigo: z.number().int().positive(), valor: z.email().max(254) }),
  z.object({ tipo: z.literal('endereco'), codigo: z.number().int().positive(), campo: enderecoCampo, valor: z.string().max(500) }),
]);

export const atualizarClienteProjuris = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ codigo: z.number().int().positive(), revisao: z.string().regex(/^[a-f0-9]{64}$/), alteracao: alteracaoSchema }))
  .handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Acesso restrito à advogada sênior ou administração.');
    if (data.alteracao.tipo === 'cadastro' && data.alteracao.campo === 'nomePessoa' && data.alteracao.valor.trim().length < 3) throw new Error('Informe o nome completo.');
    const { carteiraProjuris, invalidarCarteira } = await import('./projuris/carteira.server');
    if (!(await carteiraProjuris()).lista.some(c => c.codigo === data.codigo)) throw new Error('Cliente fora da carteira elegível.');
    const { atualizarCadastroVerificado } = await import('./projuris/cadastro.server');
    const { ErroProjuris } = await import('./projuris/cliente.server');
    try {
      await atualizarCadastroVerificado(data.codigo, data.revisao, data.alteracao as AlteracaoCadastro);
      invalidarCarteira();
      return { ok: true as const };
    } catch (e) {
      invalidarCarteira();
      if (e instanceof ErroProjuris) throw new Error(e.tipo === 'sem_permissao' ? 'O ProJuris não autorizou esta alteração cadastral.' : 'Não foi possível confirmar a alteração no ProJuris. Atualize a ficha antes de tentar novamente.');
      throw e;
    }
  });

/** Só nomes de pessoas com vínculo confirmado em casos visíveis ao solicitante. */
export const nomesConversasProjuris = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const casos = await context.supabase.from('casos').select('id,dados').eq('owner_id', context.userId);
    if (casos.error) throw new Error('Não foi possível consultar os vínculos das conversas.');
    const { vinculosConfirmados } = await import('./projuris/cadastro');
    const vinculos = vinculosConfirmados(casos.data);
    if (!vinculos.length) return {} as Record<string, string>;
    const { carteiraProjuris } = await import('./projuris/carteira.server');
    const carteira = await carteiraProjuris();
    return Object.fromEntries(vinculos.flatMap(v => { const nome = carteira.nomes.get(v.codigo); return nome ? [[v.id, nome]] : []; })) as Record<string, string>;
  });
