import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { canViewOffice } from '@/lib/approval-rules';
import { groupClients, type ClientCase } from '@/lib/clients';
import type { OfficeState } from '@/lib/office';
import type { Conversa } from '@/lib/mock-data';
import { z } from 'zod';

export const readClients = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
  if (roles.error) throw new Error('Não foi possível conferir as permissões.');
  const entireOffice = canViewOffice(roles.data.map(r => r.role));
  const client = entireOffice ? (await import('@/integrations/supabase/client.server')).supabaseAdmin : context.supabase;
  const [cases, workspaces, profiles, checklist] = await Promise.all([
    client.from('casos').select('id,owner_id,nome,etapa,dados').order('ordem'),
    client.from('office_workspace').select('owner_id,dados'),
    client.from('profiles').select('id,nome'),
    client.from('checklist_itens').select('caso_id,nome,recebido').order('ordem'),
  ]);
  if (cases.error || workspaces.error || profiles.error || checklist.error) throw new Error('Não foi possível carregar os clientes.');
  const records = cases.data.map<ClientCase>(c => {
    const d = c.dados as unknown as Partial<Conversa> & { rg?: string; numeroPeticao?: string };
    const workspace = workspaces.data.find(w => w.owner_id === c.owner_id)?.dados as unknown as OfficeState | undefined;
    const saved = workspace?.casos?.[c.id] ?? {};
    return { id: c.id, owner: c.owner_id, responsible: profiles.data.find(p => p.id === c.owner_id)?.nome || 'Equipe', mine: c.owner_id === context.userId,
      name: c.nome, cpf: d.cpf ?? '', rg: d.rg ?? '', phone: d.telefone ?? '', stage: c.etapa, attendance: d.atendimento ?? '', petitionNumber: d.numeroPeticao ?? '',
      processes: d.processos ?? [], checklist: checklist.data.filter(i => i.caso_id === c.id).map(i => ({ nome: i.nome, recebido: i.recebido })),
      work: { area: saved.area, fase: saved.fase, cnj: saved.cnj, recibo: saved.recibo, protocoloData: saved.protocoloData, tribunal: saved.tribunal, vara: saved.vara, classe: saved.classe, arquivos: (saved.arquivos ?? []).map(f => ({ ...f, analise: undefined })), movements: saved.movements, pendencias: saved.pendencias },
    };
  });
  return { clients: groupClients(records), entireOffice, updatedAt: new Date().toISOString(), projurisConnected: false };
});

export const openClientDocument = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ caseId: z.string().uuid(), fileId: z.string().uuid() })).handler(async ({ context, data }) => {
  const roles = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
  if (roles.error) throw new Error('Acesso indisponível.');
  const client = canViewOffice(roles.data.map(r => r.role)) ? (await import('@/integrations/supabase/client.server')).supabaseAdmin : context.supabase;
  const c = await client.from('casos').select('owner_id').eq('id', data.caseId).single();
  if (c.error) throw new Error('Documento indisponível.');
  const w = await client.from('office_workspace').select('dados').eq('owner_id', c.data.owner_id).single();
  const state = w.data?.dados as unknown as OfficeState | undefined;
  const file = state?.casos?.[data.caseId]?.arquivos?.find(f => f.id === data.fileId);
  if (w.error || !file || !file.path.startsWith(`${c.data.owner_id}/${data.caseId}/`)) throw new Error('Documento indisponível.');
  const result = await client.storage.from('case-documents').download(file.path);
  if (result.error || !result.data) throw new Error('Não foi possível abrir o documento.');
  // Return bytes, never internal storage hosts or private paths as public links.
  return { name: file.nome, mime: file.mime, base64: btoa(Array.from(new Uint8Array(await result.data.arrayBuffer()), b => String.fromCharCode(b)).join('')) };
});