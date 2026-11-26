import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { conversas, type Conversa } from '@/lib/mock-data';
import { anexarRegistroConsulta, type PortasRegistro } from '@/lib/atendimento/registro-consulta.server';
import { requisitosProducao } from '@/lib/atendimento/trato-feito';

/** Transcrição/resumo da consulta (dados fictícios; armazenamento e Drive em memória). */
const base = conversas[0] as Conversa;

function criarDb(c: Conversa) {
  let dados = JSON.parse(JSON.stringify(c)) as Conversa;
  let rev = 0;
  const audit: Record<string, unknown>[] = [];
  const db = {
    from() {
      let patch: { dados: Conversa } | undefined;
      const exec = () => {
        if (patch) { dados = JSON.parse(JSON.stringify(patch.dados)) as Conversa; rev++; return { error: null, data: [{ id: c.id }] }; }
        return { error: null, data: { owner_id: 'owner-1', dados: JSON.parse(JSON.stringify(dados)) as Conversa, updated_at: String(rev) } };
      };
      const q = { select: () => q, eq: () => q, update: (v: { dados: Conversa }) => { patch = v; return q; }, single: async () => exec(), maybeSingle: async () => exec(), then: (res: (v: unknown) => unknown) => Promise.resolve(exec()).then(res) };
      return q;
    },
    rpc: async (_n: string, args: Record<string, unknown>) => { audit.push(args); return { error: null }; },
  };
  return { db: db as unknown as SupabaseClient<Database>, ler: () => dados, audit };
}

function portas(opts: { falhaGuardar?: boolean; falhaDrive?: boolean } = {}) {
  const guardados: string[] = [];
  const drive: string[] = [];
  const p: PortasRegistro = {
    guardar: async path => { if (opts.falhaGuardar) throw new Error('storage fora'); guardados.push(path); },
    drive: async (_pasta, nome, _m, _b, chave) => { if (opts.falhaDrive) throw new Error('drive fora'); drive.push(`${nome}|${chave}`); return { url: 'https://drive.google.com/file/d/abc/view' }; },
  };
  return { p, guardados, drive };
}

const texto = new TextEncoder().encode('Resumo: cliente relata horas extras não pagas de 2023 a 2025.');
const conversa = (extra: Partial<Conversa> = {}): Conversa => ({ ...base, id: 'c-reg', mensagens: [], timeline: [], ...extra });

describe('registro da consulta (transcrição e resumo)', () => {
  it('guarda o original, copia para Start no Drive, associa à consulta e libera o texto para a Produção; mesmo arquivo nunca duplica', async () => {
    const { db, ler } = criarDb(conversa({ pastaDrive: { id: 'pasta-1', url: 'https://drive.google.com/drive/folders/pasta-1' } }));
    const io = portas();
    const r = await anexarRegistroConsulta(db, io.p, { conversaId: 'c-reg', ownerId: 'owner-1', autor: 'Dra.', tipo: 'resumo', nome: 'resumo.txt', mime: 'text/plain', bytes: texto });
    expect(r.duplicado).toBe(false);
    expect(io.guardados).toHaveLength(1);
    expect(io.guardados[0]).toMatch(/^owner-1\/c-reg\/consulta\/.+-resumo\.txt$/);
    expect(io.drive[0]).toMatch(/^Resumo da consulta - resumo\.txt\|consulta:[0-9a-f]{64}$/);
    expect(ler().consulta?.resumo).toContain('horas extras');
    expect(ler().consulta?.arquivos?.[0]).toMatchObject({ tipo: 'resumo', driveUrl: 'https://drive.google.com/file/d/abc/view', por: 'Dra.' });
    const deNovo = await anexarRegistroConsulta(db, io.p, { conversaId: 'c-reg', ownerId: 'owner-1', autor: 'Dra.', tipo: 'resumo', nome: 'resumo (1).txt', mime: 'text/plain', bytes: texto });
    expect(deNovo.duplicado).toBe(true);
    expect(io.guardados).toHaveLength(1);
  });

  it('falha do Drive não perde o arquivo: fica guardado com pendência; falha do armazenamento não registra nada', async () => {
    const a = criarDb(conversa({ pastaDrive: { id: 'pasta-1', url: 'x' } }));
    const r = await anexarRegistroConsulta(a.db, portas({ falhaDrive: true }).p, { conversaId: 'c-reg', ownerId: 'owner-1', autor: 'Dra.', tipo: 'transcricao', nome: 'transcricao.pdf', mime: 'application/pdf', bytes: texto });
    expect(r.arquivo).toMatchObject({ pendenciaDrive: expect.stringMatching(/Drive não confirmada/) });
    expect(a.ler().consulta?.arquivos).toHaveLength(1);
    const b = criarDb(conversa());
    await expect(anexarRegistroConsulta(b.db, portas({ falhaGuardar: true }).p, { conversaId: 'c-reg', ownerId: 'owner-1', autor: 'Dra.', tipo: 'resumo', nome: 'r.txt', mime: 'text/plain', bytes: texto })).rejects.toThrow(/storage fora/);
    expect(b.ler().consulta?.arquivos).toBeUndefined();
  });

  it('formato inválido, arquivo vazio ou grande demais: recusado sem gravar', async () => {
    const { db } = criarDb(conversa());
    await expect(anexarRegistroConsulta(db, portas().p, { conversaId: 'c-reg', ownerId: 'owner-1', autor: 'Dra.', tipo: 'resumo', nome: 'x.exe', mime: 'application/x-msdownload', bytes: texto })).rejects.toThrow(/Formato/);
    await expect(anexarRegistroConsulta(db, portas().p, { conversaId: 'c-reg', ownerId: 'owner-1', autor: 'Dra.', tipo: 'resumo', nome: 'x.txt', mime: 'text/plain', bytes: new Uint8Array() })).rejects.toThrow(/vazio/);
  });
});

describe('pronto para a Produção (só indica; a Dra. inicia)', () => {
  const pronto = conversa({ cpf: '000.000.000-00', nome: 'Maria Teste', contrato: 'assinado', documentos: [{ nome: 'RG ou CNH', recebido: true }], pastaDrive: { id: 'p', url: 'x' } });
  it('todos os requisitos: pronto; faltando um, lista o que falta', () => {
    expect(requisitosProducao(pronto).pronto).toBe(true);
    const r = requisitosProducao({ ...pronto, contrato: 'enviado', documentos: [{ nome: 'CPF', recebido: false }] });
    expect(r.pronto).toBe(false);
    expect(r.itens.filter(i => !i.ok).map(i => i.nome)).toEqual(['Contrato assinado', 'Checklist completo ou aprovado']);
    expect(requisitosProducao({ ...pronto, documentos: [{ nome: 'CPF', recebido: false }] }, { checklistAprovado: true }).pronto).toBe(true);
  });
  it('consulta registrada como realizada exige transcrição ou resumo', () => {
    const realizada = { ...pronto, consulta: { duracao: '', resumo: '', transcricao: '' }, agenteAna: { situacaoConsulta: { inicio: '2026-11-20T13:00:00.000Z', estado: 'realizada' as const, em: '2026-11-20T14:00:00.000Z', por: 'Dra.' } } };
    expect(requisitosProducao(realizada).itens.at(-1)).toEqual({ nome: 'Transcrição ou resumo da consulta', ok: false });
    expect(requisitosProducao({ ...realizada, consulta: { duracao: '', resumo: 'Resumo', transcricao: '' } }).pronto).toBe(true);
  });
});
