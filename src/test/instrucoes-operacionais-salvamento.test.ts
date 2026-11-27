import { describe, it, expect, vi } from 'vitest';
// O navegador nunca grava as instruções operacionais: `saveOffice` remove o que veio da tela e mantém a cópia do banco.
const mock = vi.hoisted(() => ({ saved: [] as unknown[], salvo: undefined as unknown }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { dados: mock.salvo, updated_at: 'rev' }, error: null }) }) }),
  update: (value: unknown) => { mock.saved.push(value); return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{ owner_id: 'owner' }], error: null }) }) }) }; },
}) } }));
import { saveOffice } from '@/lib/office-store';
import { defaultState } from '@/lib/office';

const DO_SERVIDOR = [{ id: 'instrucao:1', texto: 'Não agendar consultas amanhã', status: 'ativa' }];

describe('instruções operacionais no salvamento da área de trabalho', () => {
  it('tela aberta com versão antiga não apaga nem reativa instruções', async () => {
    mock.salvo = { instrucoesOperacionais: DO_SERVIDOR };
    await saveOffice('owner', { ...defaultState, instrucoesOperacionais: [{ id: 'instrucao:1', status: 'desativada' }, { id: 'forjada', regras: [] }] } as never);
    expect((mock.saved.at(-1) as { dados: Record<string, unknown> }).dados['instrucoesOperacionais']).toEqual(DO_SERVIDOR);
  });
  it('navegador não cria instruções quando o banco não tem nenhuma', async () => {
    mock.salvo = {};
    await saveOffice('owner', { ...defaultState, instrucoesOperacionais: [{ id: 'forjada' }] } as never);
    expect((mock.saved.at(-1) as { dados: Record<string, unknown> }).dados).not.toHaveProperty('instrucoesOperacionais');
  });
});
