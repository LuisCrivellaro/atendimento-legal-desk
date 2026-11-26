import type { Conversa, DocItem } from '@/lib/mock-data';
import { etiquetaConversa } from './intake-rules';
import { renderizarOficial, type BibliotecaSalva } from './biblioteca/renderizar';

/** Documentos base pedidos ao cliente logo após o "Trato feito". */
export const DOCUMENTOS_BASE = ['RG ou CNH', 'CPF', 'Comprovante de endereço', 'E-mail'] as const;
/** Documentos do escritório gerados para assinatura. */
export const DOCUMENTOS_CONTRATO = ['Contrato de prestação de serviços', 'Declaração de hipossuficiência'] as const;

/** Pasta do cliente na categoria AC ou RT; sem etiqueta fica em "Sem categoria" para a equipe classificar. */
export function pastaCliente(c: Pick<Conversa, 'nome' | 'atendimento' | 'etiquetaAcao' | 'mensagens'>) {
  const e = etiquetaConversa(c as Conversa);
  const categoria = e === 'AC' ? 'AC - Ação Cível' : e === 'RT' ? 'RT - Trabalhista' : 'Sem categoria';
  return `${categoria}/${c.nome} – ${c.atendimento}`;
}

/**
 * Mensagem do "Trato feito": modelo oficial 05 da biblioteca, só com o nome do cadastro. Sem nome verificado nada
 * é gerado (a equipe completa o cadastro antes): o texto oficial nunca sai sem o campo preenchido.
 */
export function tratoFeitoOficial(nome: string | undefined, biblioteca?: BibliotecaSalva) {
  const p = (nome ?? '').replace(/^\s*(RT|AC)\s*-\s*[^-]*-\s*/i, '').trim().split(/\s+/)[0] || '';
  const n = /^[\p{L}'-]{2,40}$/u.test(p) ? p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR') : undefined;
  return renderizarOficial('T05', { '[nome]': n }, { biblioteca });
}

export function mensagemTratoFeito(nome: string | undefined, biblioteca?: BibliotecaSalva) {
  const r = tratoFeitoOficial(nome, biblioteca);
  if (!r.ok) throw new Error(r.motivo === 'variavel_ausente' ? 'Nome do cliente não está no cadastro: complete o nome antes do Trato feito (mensagem oficial 05).' : 'Mensagem oficial 05 indisponível; nada foi enviado.');
  return r.texto;
}

/** Inclui os documentos base no checklist sem duplicar nem desmarcar itens já recebidos. */
export function comDocumentosBase(docs: DocItem[]): DocItem[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const has = (n: string) => docs.some(d => fold(d.nome).includes(fold(n).split(' ')[0] ?? '') || fold(n).includes(fold(d.nome)));
  return [...docs, ...DOCUMENTOS_BASE.filter(n => !has(n)).map(nome => ({ nome, recebido: false }))];
}

export type FaseTrato = 'documentos_base' | 'assinatura' | 'faltantes' | 'pronto_producao';

/** Fase atual após o Trato feito: base → contrato assinado → faltantes → pronto para Produção. */
export function faseTrato(c: Pick<Conversa, 'documentos' | 'contrato'>): FaseTrato {
  const base = c.documentos.filter(d => DOCUMENTOS_BASE.some(b => b === d.nome));
  if (base.some(d => !d.recebido)) return 'documentos_base';
  if (c.contrato !== 'assinado') return 'assinatura';
  if (c.documentos.some(d => !d.recebido)) return 'faltantes';
  return 'pronto_producao';
}

/** Aviso para a Dra.: só quando tudo foi juntado e o contrato está assinado; Produção continua manual. */
export function avisoProducao(c: Pick<Conversa, 'nome' | 'atendimento' | 'documentos' | 'contrato'>) {
  if (faseTrato(c) !== 'pronto_producao') return undefined;
  return `Dra. Carolina, o atendimento ${c.atendimento} (${c.nome}) está com contrato assinado e todos os documentos juntados. Aperte "Produção" para iniciar.`;
}

/**
 * Requisitos para indicar "pronto para a Produção" (a Produção continua começando pelo botão da Dra.): cliente
 * identificado, contrato assinado (registro manual), checklist completo ou aprovado, pasta do Drive e, quando a
 * consulta foi registrada como realizada, transcrição ou resumo anexados. Só indica; nunca inicia peça.
 */
export function requisitosProducao(c: Pick<Conversa, 'agenteAna' | 'cpf' | 'nome' | 'contrato' | 'documentos' | 'pastaDrive' | 'consulta'>, opcoes: { checklistAprovado?: boolean } = {}) {
  const realizada = c.agenteAna?.situacaoConsulta?.estado === 'realizada';
  const itens = [
    { nome: 'Cliente identificado', ok: c.agenteAna?.vinculoProjuris?.status === 'confirmado' || (!!c.cpf?.trim() && !!c.nome?.trim()) },
    { nome: 'Contrato assinado', ok: c.contrato === 'assinado' },
    { nome: 'Checklist completo ou aprovado', ok: !!opcoes.checklistAprovado || (c.documentos.length > 0 && c.documentos.every(d => d.recebido)) },
    { nome: 'Pasta do Drive', ok: !!c.pastaDrive?.id },
    ...(realizada ? [{ nome: 'Transcrição ou resumo da consulta', ok: !!c.consulta?.arquivos?.length || !!c.consulta?.resumo?.trim() }] : []),
  ];
  return { pronto: itens.every(i => i.ok), itens };
}
