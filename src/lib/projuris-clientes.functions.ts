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
    const { lerBase, sincronizarBase } = await import('./projuris/base.server');
    const { filtrarDiretorio } = await import('./projuris/diretorio');
    let { base, estado } = await lerBase(context.supabase, context.userId);
    if (data.atualizar) {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      try { base = await sincronizarBase(supabaseAdmin, context.userId); }
      catch (e) { if (!base) return { ok: false as const, erro: e instanceof Error ? e.message : 'Sincronização indisponível.' }; }
      estado = (await lerBase(context.supabase, context.userId)).estado;
    }
    if (!base) return { ok: false as const, erro: 'Base ainda não sincronizada. Use Sincronizar cadastros.' };
    return { ok: true as const, ...filtrarDiretorio(base.lista, data.busca, data.pagina, 50), totalProjuris: base.lista.length, semData: base.semData, atualizadoEm: base.em, erroSync: estado?.erro ?? null };
  });

export const obterClienteProjuris = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ codigo: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Acesso restrito à advogada sênior ou administração.');
    const { lerBase, salvarFicha } = await import('./projuris/base.server');
    const { base, estado } = await lerBase(context.supabase, context.userId);
    const cliente = base?.lista.find(c => c.codigo === data.codigo);
    if (!base || !cliente) throw new Error('Cliente fora da carteira desta conta.');
    const fichas = registroCadastro(registroCadastro(estado?.carteira)['fichas']);
    let cadastro = registroCadastro(fichas[String(data.codigo)]);
    if (cadastro['codigoPessoa'] !== data.codigo) {
      const { projuris } = await import('./projuris/cliente.server');
      cadastro = registroCadastro(await projuris.chamar('pessoa.obter', { parametros: { codigo: data.codigo } }));
      if (cadastro['codigoPessoa'] !== data.codigo) throw new Error('Cadastro não confirmado pelo ProJuris.');
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      await salvarFicha(supabaseAdmin, context.userId, data.codigo, cadastro);
    }
    const { revisaoCadastro } = await import('./projuris/cadastro.server');
    return { cliente, cadastroJson: JSON.stringify(cadastroVisivel(cadastro)), processosJson: JSON.stringify(cadastroVisivel(base.processos[String(data.codigo)] ?? [])), revisao: await revisaoCadastro(cadastro) };
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
    const { lerBase, salvarFicha } = await import('./projuris/base.server');
    const { base } = await lerBase(context.supabase, context.userId);
    if (!base?.lista.some(c => c.codigo === data.codigo)) throw new Error('Cliente fora da carteira elegível.');
    const { atualizarCadastroVerificado } = await import('./projuris/cadastro.server');
    const { ErroProjuris } = await import('./projuris/cliente.server');
    try {
      const depois = await atualizarCadastroVerificado(data.codigo, data.revisao, data.alteracao as AlteracaoCadastro);
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      await salvarFicha(supabaseAdmin, context.userId, data.codigo, depois);
      return { ok: true as const };
    } catch (e) {
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
    const { lerBase } = await import('./projuris/base.server');
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) return {} as Record<string, string>;
    const { base } = await lerBase(context.supabase, context.userId);
    return Object.fromEntries(vinculos.flatMap(v => { const nome = base?.nomes[String(v.codigo)]; return nome ? [[v.id, nome]] : []; })) as Record<string, string>;
  });
