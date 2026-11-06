import { z } from 'zod';
import type { BaseProjuris } from './projuris/base';
import { processosDaBase } from './projuris/base';
import { processoDe } from './projuris/mapeamento';
import { numeroIdentificadorProcesso, dataCadastro } from './projuris/diretorio';
import type { AndamentoPJ } from './projuris/processos';

export const filtrosContencioso = z.object({
  busca: z.string().max(120).default(''), cliente: z.string().default(''), tribunal: z.string().default(''),
  situacao: z.string().default(''), processo: z.string().default(''), inicio: z.string().default(''), fim: z.string().default(''),
  ordem: z.enum(['recente', 'antigo', 'cliente', 'numero']).default('recente'), pagina: z.coerce.number().int().min(0).catch(0).default(0),
});
export type FiltrosContencioso = z.infer<typeof filtrosContencioso>;
export interface EstadoProcesso { codigo_processo: number; atuais: unknown; ultimo_sucesso: string | null; erro: string | null; tentativa_em: string | null; falhas: number; retry_em: string | null }
export interface ProcessoContencioso {
  codigo: number; numero: string | null; identificador: string | null; clientes: { codigo: number; nome: string; cpfCnpj: string | null; polo: string | null }[];
  tribunal: string | null; vara: string | null; classe: string | null; assunto: string | null; situacao: string | null;
  ultimaMovimentacao: string | null; quantidade: number; sincronizadoEm: string | null; erro: string | null; tentativaEm: string | null; falhas: number; retryEm: string | null;
}
export interface MovimentoContencioso extends AndamentoPJ { codigoProcesso: number; dia: string | null }
export const textoPJ = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textoPJ).filter(Boolean).join(' / ') || null;
  if (v && typeof v === 'object') { const r = v as Record<string, unknown>; return textoPJ(r['valor'] ?? r['nome'] ?? r['descricao']); }
  return null;
};
export function movimentosDe(estado: EstadoProcesso): MovimentoContencioso[] {
  if (!Array.isArray(estado.atuais)) return [];
  const unicos = new Map<number, MovimentoContencioso>();
  for (const v of estado.atuais) {
    if (!v || typeof v !== 'object') continue;
    const a = v as AndamentoPJ;
    if (!Number.isSafeInteger(a.codigo) || typeof a.descricao !== 'string') continue;
    unicos.set(a.codigo, { ...a, codigoProcesso: estado.codigo_processo, dia: dataCadastro(a.data && /^\d+$/.test(a.data) ? Number(a.data) : a.data) });
  }
  return [...unicos.values()];
}
export function projetarProcessos(base: BaseProjuris, estados: EstadoProcesso[]): ProcessoContencioso[] {
  const sync = new Map(estados.map(s => [s.codigo_processo, s]));
  return processosDaBase(base).flatMap(raw => {
    const p = processoDe(raw); if (!p) return [];
    // The association requires both the persisted person ID and flagCliente, never a name match.
    const clientes = base.lista.filter(c => p.envolvidos.some(e => e.cliente && e.codigoPessoa === c.codigo) && base.processos[String(c.codigo)]?.some(r => Number(r['codigoProcesso']) === p.codigo)).map(c => {
      const envolvidos = Array.isArray(raw['processoEnvolvidoSimplificadoWs']) ? raw['processoEnvolvidoSimplificadoWs'] as Record<string, unknown>[] : [];
      const e = envolvidos.find(e => Number(e['codigoPessoaEnvolvido']) === c.codigo && e['flagCliente'] === true);
      return { codigo: c.codigo, nome: c.nomeExibicao ?? c.nome, cpfCnpj: c.cpfCnpj, polo: textoPJ(e?.['participacaoTipo']) ?? textoPJ(e?.['participacao']) };
    });
    if (!clientes.length) return [];
    const s = sync.get(p.codigo); const movimentos = s ? movimentosDe(s) : [];
    const ultima = movimentos.map(a => a.dia).filter((s): s is string => !!s).sort().at(-1) ?? null;
    return [{ codigo: p.codigo, numero: p.numero ?? null, identificador: numeroIdentificadorProcesso(raw) ?? null, clientes,
      tribunal: p.orgao ?? null, vara: p.vara ?? null, classe: textoPJ(raw['classeCnj']), assunto: p.assunto ?? textoPJ(raw['assuntoCnj']), situacao: p.situacao ?? null,
      ultimaMovimentacao: ultima, quantidade: movimentos.length, sincronizadoEm: s?.ultimo_sucesso ?? null, erro: s?.erro ?? null, tentativaEm: s?.tentativa_em ?? null, falhas: s?.falhas ?? 0, retryEm: s?.retry_em ?? null }];
  });
}
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const noPeriodo = (dia: string | null, f: Pick<FiltrosContencioso, 'inicio' | 'fim'>) => (!f.inicio && !f.fim) || !!dia && (!f.inicio || dia >= f.inicio) && (!f.fim || dia <= f.fim);
export function filtrarProcessos(lista: ProcessoContencioso[], f: FiltrosContencioso, periodo = true) {
  return lista.filter(p => (!f.cliente || p.clientes.some(c => String(c.codigo) === f.cliente)) && (!f.processo || String(p.codigo) === f.processo) && (!f.tribunal || p.tribunal === f.tribunal) && (!f.situacao || p.situacao === f.situacao) && (!periodo || noPeriodo(p.ultimaMovimentacao, f)) && (!f.busca || fold([p.numero, p.identificador, ...p.clientes.flatMap(c => [c.nome, c.cpfCnpj])].join(' ')).includes(fold(f.busca))));
}
export function ordenarProcessos(lista: ProcessoContencioso[], ordem: FiltrosContencioso['ordem']) {
  return [...lista].sort((a, b) => (ordem === 'cliente' ? a.clientes.map(c => c.nome).join().localeCompare(b.clientes.map(c => c.nome).join(), 'pt-BR') : ordem === 'numero' ? (a.numero ?? '').localeCompare(b.numero ?? '') : ordem === 'antigo' ? (a.ultimaMovimentacao ?? '').localeCompare(b.ultimaMovimentacao ?? '') : (b.ultimaMovimentacao ?? '').localeCompare(a.ultimaMovimentacao ?? '')) || a.codigo - b.codigo);
}
export function ordenarMovimentos(lista: MovimentoContencioso[], antigo = false) {
  return [...lista].sort((a, b) => (antigo ? 1 : -1) * ((a.dia ?? '').localeCompare(b.dia ?? '') || (a.hora ?? '').localeCompare(b.hora ?? '') || a.codigo - b.codigo));
}
export function paginar<T>(lista: T[], pagina: number, tamanho = 25) {
  const paginas = Math.max(1, Math.ceil(lista.length / tamanho)); const atual = Math.min(pagina, paginas - 1);
  return { itens: lista.slice(atual * tamanho, (atual + 1) * tamanho), total: lista.length, paginas, pagina: atual };
}