import type { ClienteProjurisDiretorio } from './diretorio';
import type { ProcessoPJ, AndamentoLegivel } from './processos';
import { identificarPorTelefone } from './identificacao';

export interface BaseProjuris {
  lista: ClienteProjurisDiretorio[];
  processos: Record<string, Record<string, unknown>[]>;
  nomes: Record<string, string>;
  semData: number;
  em: string;
  fichas?: Record<string, unknown>;
  revisoes?: Record<string, string>;
}
export function baseDe(v: unknown): BaseProjuris | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const b = v as BaseProjuris;
  return Array.isArray(b.lista) && b.processos && b.nomes && typeof b.em === 'string' ? b : undefined;
}
export function processosDaBase(b: BaseProjuris): Record<string, unknown>[] {
  return [...new Map(Object.values(b.processos).flat().map(p => [Number(p['codigoProcesso']), p])).values()];
}
export function identificarNaBase(b: BaseProjuris | undefined, telefone: string) {
  return identificarPorTelefone(telefone, (b?.lista ?? []).map(p => ({ codigo: p.codigo, nome: p.nome, telefones: p.telefone ? [{ numero: p.telefone, principal: true }] : [] })));
}
export function dadosDesatualizados(em: string | null | undefined, agora = Date.now()) {
  return !em || !Number.isFinite(Date.parse(em)) || Date.parse(em) > agora || agora - Date.parse(em) > 15 * 60000;
}
export function respostaFactual(fatos: { processo: ProcessoPJ; andamentos: AndamentoLegivel[]; sincronizadoEm: string | null; falha: boolean }[], agora = Date.now()): string {
  const blocos = fatos.map(f => {
    if (f.processo.segredoJustica) return 'As informações deste processo precisam ser conferidas pela equipe.';
    const a = f.andamentos[0];
    const titulo = f.processo.numero ? `Processo ${f.processo.numero}` : 'Seu processo';
    const movimento = a ? `Última movimentação registrada em ${a.data}:\n${a.descricao}` : 'Não há movimentação pública com data válida na cópia consultada.';
    const em = f.sincronizadoEm && Number.isFinite(Date.parse(f.sincronizadoEm)) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(f.sincronizadoEm)) : 'ainda não concluída';
    const ressalva = f.falha || dadosDesatualizados(f.sincronizadoEm, agora) ? '\nNão foi possível confirmar se houve novidades posteriores a essa atualização.' : '';
    const resumo = [f.processo.assunto ? `Área/assunto: ${f.processo.assunto}` : '', f.processo.situacao ? `Situação atual: ${f.processo.situacao}` : ''].filter(Boolean).join('\n');
    const confirmacao = !ressalva && a ? `\nAté essa consulta, não há movimentação pública com data válida posterior a ${a.data} no histórico confirmado.` : '';
    const explicacao = a?.simplificacao ? `\n\n${a.simplificacao}` : '';
    return `${titulo}${resumo ? `\n${resumo}` : ''}\n${movimento}${explicacao}\n\nÚltima sincronização: ${em}.${ressalva}${confirmacao}`;
  });
  return `Claro! Consultei as informações registradas do seu processo.\n\n${blocos.join('\n\n')}\n\nNossa equipe acompanha seu processo. Dúvidas que precisem de avaliação jurídica ficam com a advogada responsável.\n\nEquipe CS Lawyers ⚖️\nwww.carolinasantos.com.br`;
}