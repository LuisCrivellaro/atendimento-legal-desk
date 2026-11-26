import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ArquivoConsulta } from '../mock-data';
import { atualizarConversa } from './ana.server';

type Db = SupabaseClient<Database>;

/** Formatos aceitos para transcrição/resumo vindos do equipamento externo (texto, PDF ou documento). */
export const MIMES_REGISTRO = ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text'] as const;
export const LIMITE_REGISTRO_BYTES = 10 * 1024 * 1024;

export interface PortasRegistro {
  /** Armazenamento privado (bucket case-documents, prefixo do dono). Falha → nada é registrado. */
  guardar: (path: string, bytes: Uint8Array, mime: string) => Promise<void>;
  /** Cópia na pasta Start do Drive do cliente (dedup pela chave); falha não perde o arquivo já guardado. */
  drive?: (pastaId: string, nome: string, mime: string, bytes: Uint8Array, chave: string, tipo: string) => Promise<{ url: string }>;
}

async function sha256(bytes: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Registro da transcrição ou do resumo da consulta, enviados pela equipe a partir do equipamento externo (não há
 * integração com o fornecedor nem gravação automática do Meet nesta etapa). Guarda o original no armazenamento
 * privado, copia para "1- Start" no Drive quando a pasta existe, associa à consulta com recibo e disponibiliza o
 * texto para a Produção. Mesmo arquivo (hash) nunca é duplicado.
 */
export async function anexarRegistroConsulta(db: Db, portas: PortasRegistro, e: { conversaId: string; ownerId: string; autor: string; tipo: 'transcricao' | 'resumo'; nome: string; mime: string; bytes: Uint8Array }, agora = new Date()) {
  if (!(MIMES_REGISTRO as readonly string[]).includes(e.mime)) throw new Error('Formato não aceito: envie texto (.txt/.md), PDF ou documento (.docx/.odt).');
  if (!e.bytes.length || e.bytes.length > LIMITE_REGISTRO_BYTES) throw new Error('Arquivo vazio ou acima de 10 MB.');
  const row = await db.from('casos').select('dados').eq('id', e.conversaId).single();
  if (row.error) throw new Error('Conversa indisponível.');
  const c = row.data.dados as unknown as { consulta?: { arquivos?: ArquivoConsulta[] }; pastaDrive?: { id: string } };
  const hash = await sha256(e.bytes);
  const existente = c.consulta?.arquivos?.find(a => a.hash === hash);
  if (existente) return { duplicado: true as const, arquivo: existente };
  const nomeSeguro = e.nome.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100) || 'registro';
  const path = `${e.ownerId}/${e.conversaId}/consulta/${crypto.randomUUID()}-${nomeSeguro}`;
  await portas.guardar(path, e.bytes, e.mime);
  let driveUrl: string | undefined;
  let pendenciaDrive: string | undefined;
  const pasta = c.pastaDrive?.id;
  if (pasta && portas.drive) {
    try { driveUrl = (await portas.drive(pasta, `${e.tipo === 'transcricao' ? 'Transcrição' : 'Resumo'} da consulta - ${nomeSeguro}`, e.mime, e.bytes, `consulta:${hash}`, e.tipo)).url; }
    catch { pendenciaDrive = 'cópia no Drive não confirmada; o original está guardado no Manager'; }
  } else if (!pasta) pendenciaDrive = 'pasta do Drive ainda não criada (Trato feito/assinatura): copiar depois';
  const texto = e.mime === 'text/plain' || e.mime === 'text/markdown' ? new TextDecoder().decode(e.bytes).slice(0, 100000) : undefined;
  const arquivo: ArquivoConsulta = { tipo: e.tipo, nome: nomeSeguro, mime: e.mime, path, hash, em: agora.toISOString(), por: e.autor.slice(0, 80), ...(driveUrl ? { driveUrl } : {}), ...(pendenciaDrive ? { pendenciaDrive } : {}) };
  await atualizarConversa(db, e.conversaId, x => {
    if (x.consulta?.arquivos?.some(a => a.hash === hash)) return x;
    const consulta = { duracao: x.consulta?.duracao ?? '', resumo: x.consulta?.resumo ?? '', transcricao: x.consulta?.transcricao ?? '', arquivos: [...(x.consulta?.arquivos ?? []), arquivo] };
    if (texto && e.tipo === 'resumo') consulta.resumo = texto;
    if (texto && e.tipo === 'transcricao') consulta.transcricao = texto;
    return { ...x, consulta, timeline: [...x.timeline, { data: agora.toISOString(), evento: `${e.tipo === 'transcricao' ? 'Transcrição' : 'Resumo'} da consulta anexado por ${arquivo.por}${driveUrl ? ' · copiado para Start no Drive' : pendenciaDrive ? ` · ${pendenciaDrive}` : ''}` }] };
  });
  await db.rpc('registrar_audit_log', { p_ator: arquivo.por, p_perfil: 'equipe', p_acao: 'registroConsulta', p_resumo: `${e.tipo} anexado${driveUrl ? ' e copiado ao Drive' : ''}`, p_status: pendenciaDrive && pasta ? 'erro' : 'sucesso' });
  return { duplicado: false as const, arquivo };
}
