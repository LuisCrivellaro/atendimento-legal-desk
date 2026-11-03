import type { ClienteProjurisDiretorio } from './diretorio';
import type { ProcessoPJ, AndamentoLegivel } from './processos';

export interface BaseProjuris {
  lista: ClienteProjurisDiretorio[];
  processos: Record<string, Record<string, unknown>[]>;
  nomes: Record<string, string>;
  semData: number;
  em: string;
}
export function baseDe(v: unknown): BaseProjuris | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const b = v as BaseProjuris;
  return Array.isArray(b.lista) && b.processos && b.nomes && typeof b.em === 'string' ? b : undefined;
}
export function processosDaBase(b: BaseProjuris): Record<string, unknown>[] {
  return [...new Map(Object.values(b.processos).flat().map(p => [Number(p['codigoProcesso']), p])).values()];
}
export function dadosDesatualizados(em: string | null | undefined, agora = Date.now()) {
  return !em || !Number.isFinite(Date.parse(em)) || agora - Date.parse(em) > 15 * 60000;
}
export function respostaFactual(fatos: { processo: ProcessoPJ; andamentos: AndamentoLegivel[]; sincronizadoEm: string | null; falha: boolean }[], agora = Date.now()): string {
  const blocos = fatos.map(f => {
    if (f.processo.segredoJustica) return 'As informações deste processo precisam ser conferidas pela equipe.';
    const a = f.andamentos[0];
    const titulo = f.processo.numero ? `Processo ${f.processo.numero}` : 'Seu processo';
    const movimento = a ? `Última movimentação registrada em ${a.data}:\n${a.descricao}` : 'Não há movimentação pública com data válida na cópia consultada.';
    const em = f.sincronizadoEm ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(f.sincronizadoEm)) : 'ainda não concluída';
    const ressalva = f.falha || dadosDesatualizados(f.sincronizadoEm, agora) ? '\nNão foi possível confirmar se houve novidades posteriores a essa atualização.' : '';
    return `${titulo}\n${movimento}\n\nÚltima sincronização: ${em}.${ressalva}`;
  });
  return `Consultei as informações registradas no CS.IA.\n\n${blocos.join('\n\n')}\n\nA interpretação jurídica dessas informações fica com a advogada responsável.`;
}