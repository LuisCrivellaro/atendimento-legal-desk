import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import { lerBase } from '../projuris/base.server';
import { identificarNaBase } from '../projuris/base';
import { identificarClienteProjuris } from '../projuris/indice.server';
import { criarConsultasProjuris } from '../projuris/consultas.server';
import { relacionamentoAna } from './ana-relacionamento';
import { origemMensagem } from './secretaria/origem';

export async function reconhecerRelacionamentoAna(db: SupabaseClient<Database>, owner: string, c: Conversa, telefone: string, canal: string) {
  const { base } = await lerBase(db, owner).catch(() => ({ base: undefined }));
  const local = identificarNaBase(base, telefone);
  try {
    // Complete index catches old clients AND duplicates outside the directory cohort.
    const identidade = await identificarClienteProjuris(telefone);
    const ativos = identidade.tipo === 'unico' ? await criarConsultasProjuris().processosAtivos(identidade.pessoa.codigo) : [];
    const rel = relacionamentoAna(c, telefone, canal, identidade, ativos.length);
    // Only relationship/count goes to inference, never provider process numbers or private facts.
    return { identidade, rel, nome: identidade.tipo === 'unico' ? identidade.pessoa.nome : '' };
  } catch {
    // Absence in the filtered replica is NOT proof of a new lead. Fail closed for acquisition.
    // Exceção da Dra. Carolina (20/11/2026): contato novo, sem histórico da equipe e ausente da base local,
    // recebe a saudação gratuita com horários mesmo se a consulta completa ao ProJuris falhar.
    // Equipe = pessoa do escritório (origem gravada pelo servidor); a Anne e as automações não contam.
    const semHistorico = !c.mensagens.some(m => origemMensagem(m) === 'equipe') && !c.consultaAgendada && !c.contrato;
    const rel = relacionamentoAna(c, telefone, canal, local.tipo === 'unico' || local.tipo === 'nao_encontrado' && semHistorico ? local : undefined);
    return { identidade: local, rel, nome: '' };
  }
}