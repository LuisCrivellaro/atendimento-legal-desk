import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Conversa } from '../../mock-data';
import type { OfficeState } from '../../office';
import { defaultAutomations } from '../../atendimento';
import { horarioEspecificoLivre, horizonteAgendaAna, selecionarOpcoesAna } from '../ana-scheduling';
import { lerConfigSecretaria, secretariaAtiva, type ConfigSecretaria } from './config';
import type { ContextoOperacional, PortasOperacionais } from './operacional';

type Db = SupabaseClient<Database>;

/** Configuração da secretaria lida da área de trabalho do dono (nunca do navegador nem do modelo). */
export function configDoEstado(state: unknown): ConfigSecretaria {
  return lerConfigSecretaria((state as { secretaria?: unknown } | null | undefined)?.secretaria);
}

/** Flag efetiva: área de trabalho + chave mestra do servidor `ANNE_SECRETARIA_DESLIGADA`. */
export function secretariaLigada(state: unknown) {
  return secretariaAtiva(configDoEstado(state), process.env['ANNE_SECRETARIA_DESLIGADA']);
}

/**
 * Monta o contexto da camada operacional para uma conversa: configuração, ambiente (canal, agente, pausa
 * global), contato liberado e vinculado, modo padrão. Qualquer falha de leitura fecha (secretaria inativa).
 */
export async function contextoSecretaria(db: Db, conversaId: string, canal = 'ultramsg'): Promise<ContextoOperacional & { ownerId: string; state: OfficeState | undefined }> {
  const caso = await db.from('casos').select('owner_id').eq('id', conversaId).single();
  if (caso.error) throw new Error('Conversa indisponível.');
  const ownerId = caso.data.owner_id;
  const [ws, cfg, contato] = await Promise.all([
    db.from('office_workspace').select('dados').eq('owner_id', ownerId).maybeSingle(),
    db.from('atendimento_canal_config').select('canal_ativo,agente_ativo').eq('id', true).maybeSingle(),
    db.from('atendimento_contatos_teste').select('contato_externo').eq('conversa_id', conversaId).eq('canal', canal).eq('status', 'liberado').maybeSingle(),
  ]);
  const state = ws.error ? undefined : (ws.data?.dados as unknown as OfficeState | undefined);
  const config = configDoEstado(state);
  const ativa = !ws.error && !cfg.error && !contato.error && secretariaAtiva(config, process.env['ANNE_SECRETARIA_DESLIGADA']);
  return {
    ownerId, state, config, ativa, canal,
    ambiente: { agenteAtivo: cfg.data?.agente_ativo === true, canalAtivo: cfg.data?.canal_ativo === canal, pausaGlobal: !!state?.anaPausa?.ativa },
    contato: contato.data?.contato_externo ?? undefined,
    modoPadrao: state?.automations?.modoIA ?? defaultAutomations.modoIA,
  };
}

function clienteAgenda(c: Conversa) {
  const tipo = c.tipoClienteAgenda ?? c.agenteAna?.tipoCliente ?? 'novo';
  return { nome: (c.agenteAna?.dados?.nome || c.nome || '').trim(), telefone: c.agenteAna?.telefone || c.telefone || '', tipo };
}

/** Portas reais: banco com CAS, envio pela camada central (com conferência final) e agenda oficial. */
export function portasSupabase(db: Db, ownerId: string, conversaId: string): PortasOperacionais {
  const ler = async (id: string) => {
    const r = await db.from('casos').select('dados').eq('id', id).maybeSingle();
    if (r.error) throw new Error('Conversa indisponível.');
    return (r.data?.dados as unknown as Conversa | undefined) ?? undefined;
  };
  return {
    agora: () => new Date(),
    ler,
    atualizar: async (id, fn) => {
      const { atualizarConversa } = await import('../ana.server');
      return atualizarConversa(db, id, fn);
    },
    enviar: async ({ conversaId: id, texto, automacaoId, contatoEsperado }) => {
      const { enviarMensagemSistema } = await import('../envio.functions');
      const sent = await enviarMensagemSistema({ supabase: db, conversaId: id, texto, motivo: 'automacao', contatoEsperado, automacaoId });
      if (sent.simulado) throw new Error('Canal desligado; nada foi enviado.');
      return { idExterno: sent.idExterno };
    },
    agenda: {
      opcoes: async evitar => {
        const c = await ler(conversaId);
        if (!c) return null;
        const { ocupadosAgenda } = await import('../projuris-agenda.server');
        const agora = new Date();
        const busy = await ocupadosAgenda(db, ownerId, agora, horizonteAgendaAna(agora));
        if (!busy) return null;
        return selecionarOpcoesAna(busy, agora, clienteAgenda(c).tipo, '', evitar, true).slots;
      },
      horarioLivre: async iso => {
        const c = await ler(conversaId);
        if (!c) return null;
        const { ocupadosAgenda } = await import('../projuris-agenda.server');
        const agora = new Date();
        const busy = await ocupadosAgenda(db, ownerId, agora, horizonteAgendaAna(agora));
        if (!busy) return null;
        return horarioEspecificoLivre(iso, busy, clienteAgenda(c).tipo, agora);
      },
      remarcar: async (atual, novo) => {
        const c = await ler(conversaId);
        if (!c) throw new Error('Conversa indisponível.');
        const { remarcarAgenda } = await import('../projuris-agenda.server');
        // Reserva o novo antes de concluir o anterior, confirma por leitura e desfaz se a conclusão falhar.
        return remarcarAgenda(db, ownerId, conversaId, atual, novo, true, new Date(), clienteAgenda(c));
      },
    },
    auditar: async (acao, resumo, status) => {
      await db.rpc('registrar_audit_log', { p_ator: 'Anne', p_perfil: 'sistema', p_acao: acao, p_resumo: resumo.slice(0, 300), p_status: status });
    },
  };
}
