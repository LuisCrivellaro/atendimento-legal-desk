import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { filtrosContencioso, filtrarProcessos, ordenarProcessos, ordenarMovimentos, paginar, projetarProcessos, movimentosDe, noPeriodo } from './contencioso';
import { z } from 'zod';

export const consultarContencioso = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(filtrosContencioso.extend({ modo: z.enum(['processos', 'andamentos', 'ficha']), codigo: z.number().int().positive().optional() }))
  .handler(async ({ context, data }) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roles.error || !roles.data.some(r => r.role === 'admin' || r.role === 'advogada_senior')) throw new Error('Contencioso reservado à advogada sênior ou administração.');
    const { lerBase } = await import('./projuris/base.server');
    const { base, estado } = await lerBase(context.supabase, context.userId);
    // Range through every database page; Data API's default row cap is not a completeness signal.
    const estados = [];
    for (let offset = 0; ; offset += 500) {
      const r = await context.supabase.from('projuris_sync_processos').select('*').eq('owner_id', context.userId).order('codigo_processo').range(offset, offset + 499);
      if (r.error) throw new Error('Histórico operacional indisponível.');
      estados.push(...r.data); if (r.data.length < 500) break;
    }
    const processos = base ? projetarProcessos(base, estados) : [];
    const codigos = new Set(processos.map(p => p.codigo));
    const movimentos = estados.filter(s => codigos.has(s.codigo_processo)).flatMap(movimentosDe);
    const ficha = data.modo === 'ficha' ? processos.find(p => p.codigo === data.codigo) ?? null : null;
    if (data.modo === 'ficha' && !ficha) throw new Error('Processo não vinculado à carteira desta conta.');
    const filtrados = filtrarProcessos(processos, data, data.modo === 'processos');
    const ids = new Set(filtrados.map(p => p.codigo));
    const selecao = movimentos.filter(a => (data.modo === 'ficha' ? a.codigoProcesso === data.codigo : ids.has(a.codigoProcesso)) && noPeriodo(a.dia, data) && (data.modo !== 'andamentos' || !data.busca || a.descricao.toLowerCase().includes(data.busca.toLowerCase()) || processos.find(p => p.codigo === a.codigoProcesso)?.numero?.includes(data.busca)));
    // Movement search must not first discard the process when the term only matches its description.
    const selecaoGlobal = data.modo === 'andamentos' && data.busca ? movimentos.filter(a => {
      const p = processos.find(p => p.codigo === a.codigoProcesso);
      return p && filtrarProcessos([p], { ...data, busca: '' }, false).length > 0 && noPeriodo(a.dia, data) && (a.descricao.toLowerCase().includes(data.busca.toLowerCase()) || filtrarProcessos([p], data, false).length > 0);
    }) : selecao;
    return {
      processos: data.modo === 'processos' ? paginar(ordenarProcessos(filtrados, data.ordem), data.pagina) : paginar<ReturnType<typeof projetarProcessos>[number]>([], 0),
      movimentos: paginar(ordenarMovimentos(selecaoGlobal, data.ordem === 'antigo'), data.pagina, data.modo === 'ficha' ? 50 : 25), ficha,
      referencias: processos.map(p => ({ codigo: p.codigo, numero: p.numero, clientes: p.clientes })),
      opcoes: { clientes: base?.lista.map(c => ({ codigo: c.codigo, nome: c.nomeExibicao ?? c.nome })) ?? [], tribunais: [...new Set(processos.map(p => p.tribunal).filter((x): x is string => !!x))].sort(), situacoes: [...new Set(processos.map(p => p.situacao).filter((x): x is string => !!x))].sort() },
      painel: { processos: processos.length, andamentos: movimentos.length, pendentes: processos.filter(p => !p.sincronizadoEm).length, falhas: processos.filter(p => p.erro).length, ultima: estado?.sincronizado_em ?? null, erro: estado?.erro ?? null, historicoEm: processos.map(p => p.sincronizadoEm).filter((x): x is string => !!x).sort().at(-1) ?? null },
      fila: [...processos].sort((a, b) => (a.sincronizadoEm ?? '').localeCompare(b.sincronizadoEm ?? '')).map(p => p.codigo),
      falhas: processos.filter(p => p.erro).map(p => ({ codigo: p.codigo, numero: p.numero, erro: p.erro, tentativaEm: p.tentativaEm, retryEm: p.retryEm, falhas: p.falhas })),
    };
  });