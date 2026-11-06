import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { baseDe, dadosDesatualizados, identificarNaBase, processosDaBase, type BaseProjuris } from './base';
import { carregarCarteira } from './carteira.server';
import { projuris, ErroProjuris, type ClienteProjuris } from './cliente.server';
import { andamentoDe, processoDe, registros, totalRegistros } from './mapeamento';
import { revisaoCadastro } from './cadastro.server';
import { cadastroVisivel } from './cadastro';
import type { Identificacao } from './identificacao';
import { ultimosAndamentosPublicos, type AndamentoPJ } from './processos';
type Db = SupabaseClient<Database>;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Json;
const erroSeguro = (e: unknown) => e instanceof ErroProjuris ? e.tipo === 'sem_permissao' ? 'ProJuris negou permissão para esta leitura.' : e.tipo === 'configuracao' ? 'Credenciais ProJuris ausentes.' : `Consulta ProJuris indisponível (${e.tipo}).` : 'Não foi possível concluir a sincronização.';

export async function lerBase(db: Db, owner: string) {
  const r = await db.from('projuris_base').select('*').eq('owner_id', owner).maybeSingle();
  if (r.error) throw new Error('Base operacional indisponível.');
  return { base: baseDe(r.data?.carteira), estado: r.data };
}
export async function sincronizarBase(db: Db, owner: string) {
  const token = crypto.randomUUID();
  const claim = await db.rpc('projuris_claim', { p_owner: owner, p_codigo: 0, p_token: token });
  if (claim.error || !claim.data) throw new Error('Outra sincronização cadastral está em andamento.');
  try {
    const anterior = await lerBase(db, owner);
    const c = await carregarCarteira();
    const elegiveis = new Set(c.lista.map(p => p.codigo));
    const ativo = await import('./consultas.server').then(m => m.criarConsultasProjuris().codigoSituacaoAtivo());
    const base: BaseProjuris = { lista: c.lista, processos: Object.fromEntries([...c.porPessoa].filter(([id]) => elegiveis.has(id)).map(([id, ps]) => [String(id), ps.filter(p => processoDe(p)?.codigoSituacao === ativo)])), nomes: Object.fromEntries([...c.nomes].filter(([id]) => elegiveis.has(id))), semData: c.semData, em: new Date().toISOString(), fichas: anterior.base?.fichas ?? {}, revisoes: anterior.base?.revisoes ?? {} };
    const r = await db.from('projuris_base').update({ carteira: json(base), sincronizado_em: base.em, erro: null, lease_token: null, lease_ate: null }).eq('owner_id', owner).eq('lease_token', token).select('owner_id');
    if (r.error || !r.data?.length) throw new Error('Sincronização não persistida.');
    await db.rpc('registrar_audit_log', { p_ator: owner, p_perfil: 'sistema', p_acao: 'projuris_base_sincronizada', p_resumo: `${base.lista.length} cadastros sincronizados`, p_status: 'sucesso' });
    return base;
  } catch (e) {
    await db.from('projuris_base').update({ erro: erroSeguro(e), lease_token: null, lease_ate: null }).eq('owner_id', owner).eq('lease_token', token);
    throw new Error(erroSeguro(e));
  }
}

/** Todas as páginas, inclusive intermediárias; só publica o snapshot quando a leitura é completa. */
export async function lerTodosAndamentos(codigo: number, cliente: Pick<ClienteProjuris, 'chamar'> = projuris): Promise<AndamentoPJ[]> {
  const todos = new Map<number, AndamentoPJ>();
  const chaves = ['andamentoProcessoWs', 'andamentoWs', 'andamentos'];
  for (let pagina = 0; pagina < 200; pagina++) {
    const raw = await cliente.chamar('processo.andamentos', { parametros: { codigo }, consulta: { pagina, 'quan-registros': 50 } });
    const lote = registros(raw, chaves);
    const antes = todos.size;
    for (const r of lote) {
      const a = andamentoDe(r);
      if (!a) throw new Error('Andamento sem identificação válida; leitura incompleta.');
      todos.set(a.codigo, a);
    }
    const informado = raw && typeof raw === 'object' && !Array.isArray(raw) && typeof (raw as Record<string, unknown>)['totalRegistros'] === 'number';
    const total = totalRegistros(raw, chaves);
    if (!lote.length && todos.size < total) throw new Error('Paginação incompleta.');
    if (informado ? todos.size >= total : !lote.length) return [...todos.values()];
    if (todos.size === antes) throw new Error('Paginação sem avanço.');
  }
  throw new Error('Limite de páginas atingido; dados anteriores preservados.');
}
export async function sincronizarProcesso(db: Db, owner: string, codigo: number) {
  const { base } = await lerBase(db, owner);
  if (!base || !processosDaBase(base).some(p => p['codigoProcesso'] === codigo)) throw new Error('Processo não vinculado à carteira desta conta.');
  const token = crypto.randomUUID();
  const claim = await db.rpc('projuris_claim', { p_owner: owner, p_codigo: codigo, p_token: token });
  if (claim.error || !claim.data) throw new Error('Este processo já está em sincronização.');
  try {
    const movimentos = await lerTodosAndamentos(codigo);
    const versoes = await Promise.all(movimentos.map(async dados => ({ codigo: dados.codigo, hash: await revisaoCadastro(dados as unknown as Record<string, unknown>), dados })));
    const r = await db.rpc('projuris_commit_movimentos', { p_owner: owner, p_codigo: codigo, p_token: token, p_movimentos: json(versoes) });
    if (r.error) throw new Error('Movimentos não persistidos.');
    await db.rpc('registrar_audit_log', { p_ator: owner, p_perfil: 'sistema', p_acao: 'projuris_andamentos_sincronizados', p_resumo: `${r.data} versões novas`, p_status: 'sucesso' });
    return { ok: true as const, novas: r.data, total: movimentos.length };
  } catch (e) {
    const anterior = await db.from('projuris_sync_processos').select('falhas').eq('owner_id', owner).eq('codigo_processo', codigo).single();
    const falhas = (anterior.data?.falhas ?? 0) + 1;
    const erro = erroSeguro(e);
    await db.from('projuris_sync_processos').update({ erro, falhas, retry_em: new Date(Date.now() + Math.min(60, 2 ** falhas) * 60000).toISOString(), lease_token: null, lease_ate: null }).eq('owner_id', owner).eq('codigo_processo', codigo).eq('lease_token', token);
    await db.rpc('registrar_audit_log', { p_ator: owner, p_perfil: 'sistema', p_acao: 'projuris_sync_falha', p_resumo: 'Dados anteriores preservados', p_status: 'erro', p_erro: erro });
    return { ok: false as const, erro };
  }
}
export async function identificarLocal(db: Db, owner: string, telefone: string): Promise<Identificacao> {
  const { base } = await lerBase(db, owner);
  return identificarNaBase(base, telefone);
}
export async function portasLocais(db: Db, owner: string) {
  const { base } = await lerBase(db, owner);
  if (!base) return undefined;
  const dados = await db.from('projuris_sync_processos').select('*').eq('owner_id', owner);
  if (dados.error) throw new Error('Andamentos locais indisponíveis.');
  const porCodigo = new Map(dados.data.map(r => [r.codigo_processo, r]));
  return {
    identificar: (telefone: string) => identificarLocal(db, owner, telefone),
    processosAtivos: async (codigoPessoa: number) => (base.processos[String(codigoPessoa)] ?? []).flatMap(p => { const m = processoDe(p); return m && m.envolvidos.some(e => e.codigoPessoa === codigoPessoa && e.cliente) ? [m] : []; }),
    ultimosAndamentos: async (codigo: number) => ultimosAndamentosPublicos((porCodigo.get(codigo)?.atuais ?? []) as unknown as AndamentoPJ[]),
    estado: (codigo: number) => ({ sincronizadoEm: porCodigo.get(codigo)?.ultimo_sucesso ?? null, falha: !!porCodigo.get(codigo)?.erro }),
    fatosRegistrados: async (codigo: number, pergunta: string) => {
      const t = pergunta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const categorias = [
        { pedido: /audiencia/, registro: /audiencia/ },
        { pedido: /prazo/, registro: /prazo/ },
        { pedido: /documentos? (?:pendentes?|faltantes?)/, registro: /documento.{0,80}(?:pendente|faltante|apresentar)|(?:apresentar|providenciar|juntar).{0,80}documento/ },
        { pedido: /providencia/, registro: /providencia/ },
        { pedido: /decisao|despacho/, registro: /decisao|despacho|sentenca/ },
      ].filter(c => c.pedido.test(t));
      if (!categorias.length) return undefined;
      return ultimosAndamentosPublicos((porCodigo.get(codigo)?.atuais ?? []) as unknown as AndamentoPJ[], Number.MAX_SAFE_INTEGER).filter(a => categorias.some(c => c.registro.test(a.descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))).slice(0, 3);
    },
  };
}
export async function salvarFicha(db: Db, owner: string, codigo: number, ficha: Record<string, unknown>) {
  const r = await db.rpc('projuris_salvar_ficha', { p_owner: owner, p_codigo: codigo, p_ficha: json(cadastroVisivel(ficha)), p_revisao: await revisaoCadastro(ficha) });
  if (r.error) throw new Error('Ficha não persistida; recarregue.');
}

/** Consulta owner-scoped: reaproveita leases/commits; nunca retorna snapshot antigo como atual. */
export async function portasConsultaAtualizada(db: Db, owner: string) {
  const { criarConsultasProjuris } = await import('./consultas.server');
  const { identificarClienteProjuris } = await import('./indice.server');
  const consultas = criarConsultasProjuris();
  let local = await portasLocais(db, owner);
  let base = (await lerBase(db, owner)).base;
  return {
    identificar: async (telefone: string) => {
      // A carteira filtrada não prova unicidade entre TODOS os cadastros do provedor.
      if (local) await local.identificar(telefone);
      return identificarClienteProjuris(telefone);
    },
    prepararProcessos: async (pessoa: number) => {
      if (!base || dadosDesatualizados(base.em)) {
        base = await sincronizarBase(db, owner);
        local = await portasLocais(db, owner);
      }
      // Confere situação, sigilo e flagCliente no provedor antes de divulgar.
      const oficiais = await consultas.processosAtivos(pessoa);
      const vinculados = new Set((base?.processos[String(pessoa)] ?? []).map(p => Number(p['codigoProcesso'])));
      if (oficiais.some(p => !vinculados.has(p.codigo))) {
        base = await sincronizarBase(db, owner);
        local = await portasLocais(db, owner);
      }
      const permitidos = new Set((base?.processos[String(pessoa)] ?? []).map(p => Number(p['codigoProcesso'])));
      if (oficiais.some(p => !permitidos.has(p.codigo))) throw new Error('Carteira local não contém todos os processos oficiais; equipe deve conferir.');
      return oficiais;
    },
    processosAtivos: async (pessoa: number) => local?.processosAtivos(pessoa) ?? [],
    confirmarAtualizacao: async (codigo: number) => {
      const estado = local?.estado(codigo);
      if (!estado || estado.falha || dadosDesatualizados(estado.sincronizadoEm)) {
        const resultado = await sincronizarProcesso(db, owner, codigo);
        if (!resultado.ok) throw new Error('Não foi possível confirmar a atualização processual.');
        local = await portasLocais(db, owner);
      }
    },
    ultimosAndamentos: async (codigo: number) => local?.ultimosAndamentos(codigo) ?? [],
    fatosRegistrados: async (codigo: number, pergunta: string) => local?.fatosRegistrados(codigo, pergunta),
    estadoLocal: (codigo: number) => local?.estado(codigo) ?? { sincronizadoEm: null, falha: true },
  };
}
