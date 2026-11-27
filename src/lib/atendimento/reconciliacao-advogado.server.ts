import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Conversa } from '../mock-data';
import type { ProcessoPJ } from '../projuris/processos';
import { baseDe, identificarNaBase, type BaseProjuris } from '../projuris/base';
import { processoDe } from '../projuris/mapeamento';
import { relacionamentoAna } from './ana-relacionamento';
import { processoRelacionado } from './encaminhamento-advogado';
import { aplicarReconciliacao, avaliarConversaAdvogado, type TipoConversaAdvogado } from './reconciliacao-advogado';
import { lerConfigEncaminhamento, type ConfigEncaminhamento } from './secretaria/encaminhamento-config';
import { origemMensagem } from './secretaria/origem';

type Db = SupabaseClient<Database>;

/**
 * Varredura de todas as conversas (paginada por id, incremental, com cursor persistido) que reconstrói a fila do
 * advogado sem enviar nada aos clientes. Roda no monitor de 5 minutos (sem navegador) e é obrigatória antes de cada
 * relatório. O estado guarda só contagens e ids de conversa (nomes e telefones ficam no caso).
 */
export const ID_RECONCILIACAO_ADVOGADO = 'reconciliacao-advogado';
export interface ExemploReconciliacao { conversaId: string; motivo: string; desde?: string | undefined }
export interface ResumoReconciliacao {
  iniciadaEm: string;
  cursor: string;
  analisadas: number;
  contagem: Record<TipoConversaAdvogado, number>;
  naoVerificadas: number;
  /** Casos sem mensagem do WhatsApp (demonstração/cadastro): fora da fila. */
  foraDoWhatsApp?: number | undefined;
  criadas: number;
  atualizadas: number;
  erros: number;
  falha?: string | undefined;
  exemplos: { ambiguas: ExemploReconciliacao[]; antigas: ExemploReconciliacao[]; naoVerificadas: ExemploReconciliacao[] };
}
export interface ReconciliacaoConcluida extends ResumoReconciliacao { concluidaEm: string; ok: boolean }
export interface EstadoReconciliacao { emAndamento?: ResumoReconciliacao | undefined; ultimaCompleta?: ReconciliacaoConcluida | undefined }
export interface ResultadoReconciliacao { completa: boolean; ok: boolean; resumo: ResumoReconciliacao | ReconciliacaoConcluida }

const PAGINA = 50;
const MAX_EXEMPLOS = 40;
const novaPassagem = (agora: Date): ResumoReconciliacao => ({
  iniciadaEm: agora.toISOString(), cursor: '', analisadas: 0, naoVerificadas: 0, criadas: 0, atualizadas: 0, erros: 0,
  contagem: { pendente: 0, ambigua: 0, resolvida: 0, sem_solicitacao: 0, fora_escopo: 0, antiga: 0 },
  exemplos: { ambiguas: [], antigas: [], naoVerificadas: [] },
});
const exemplo = (lista: ExemploReconciliacao[], x: ExemploReconciliacao) => { if (lista.length < MAX_EXEMPLOS && !lista.some(y => y.conversaId === x.conversaId)) lista.push(x); };

export async function lerEstadoReconciliacao(db: Db): Promise<EstadoReconciliacao> {
  const r = await db.from('ana_monitoramento').select('estado').eq('id', ID_RECONCILIACAO_ADVOGADO).maybeSingle();
  if (r.error) throw new Error('Estado da verificação da fila indisponível.');
  return ((r.data?.estado ?? {}) as unknown as EstadoReconciliacao) ?? {};
}
async function gravarEstado(db: Db, estado: EstadoReconciliacao, agora: Date) {
  const r = await db.from('ana_monitoramento').upsert({ id: ID_RECONCILIACAO_ADVOGADO, estado: JSON.parse(JSON.stringify(estado)) as Json, verificado_em: agora.toISOString() });
  return !r.error;
}

/** Processos ativos da réplica local do ProJuris em que a pessoa é cliente (mesma regra de `portasLocais`). */
function processosDaPessoa(base: BaseProjuris, codigo: number): ProcessoPJ[] {
  return (base.processos[String(codigo)] ?? []).flatMap(p => { const m = processoDe(p); return m && m.envolvidos.some(e => e.codigoPessoa === codigo && e.cliente) ? [m] : []; });
}

/**
 * Continua (ou inicia) a varredura. `inicioMinimo`: a passagem usada precisa ter começado depois disso (o relatório
 * exige uma verificação iniciada no próprio horário); passagem mais antiga em andamento é descartada e recomeça.
 */
export async function reconciliarFilaAdvogado(db: Db, agora = new Date(), opcoes: { inicioMinimo?: string; limiteMs?: number; pagina?: number; relogio?: () => number } = {}): Promise<ResultadoReconciliacao> {
  const relogio = opcoes.relogio ?? (() => Date.now());
  const comeco = relogio();
  const limite = opcoes.limiteMs ?? 15000;
  const pagina = opcoes.pagina ?? PAGINA;
  const estado = await lerEstadoReconciliacao(db);
  const minimo = opcoes.inicioMinimo ? Date.parse(opcoes.inicioMinimo) : -Infinity;
  if (!estado.emAndamento && estado.ultimaCompleta && Date.parse(estado.ultimaCompleta.iniciadaEm) >= minimo) return { completa: true, ok: estado.ultimaCompleta.ok, resumo: estado.ultimaCompleta };
  const passagem = estado.emAndamento && Date.parse(estado.emAndamento.iniciadaEm) >= minimo ? estado.emAndamento : novaPassagem(agora);
  passagem.falha = undefined;
  const ws = await db.from('office_workspace').select('owner_id,dados');
  if (ws.error) {
    passagem.erros++; passagem.falha = 'configuração das áreas de trabalho indisponível';
    await gravarEstado(db, { ...estado, emAndamento: passagem }, agora);
    return { completa: false, ok: false, resumo: passagem };
  }
  const configs = new Map<string, ConfigEncaminhamento>(((ws.data ?? []) as { owner_id: string; dados: unknown }[]).map(w => [w.owner_id, lerConfigEncaminhamento((w.dados as { secretaria?: { encaminhamento?: unknown } } | null)?.secretaria?.encaminhamento)]));
  const bases = new Map<string, BaseProjuris | null>();
  const baseDoDono = async (owner: string) => {
    if (!bases.has(owner)) {
      const r = await db.from('projuris_base').select('carteira').eq('owner_id', owner).maybeSingle();
      bases.set(owner, r.error ? null : baseDe(r.data?.carteira) ?? null);
    }
    return bases.get(owner) ?? undefined;
  };
  const { atualizarConversa } = await import('./ana.server');
  for (;;) {
    const consulta = db.from('casos').select('id,owner_id,dados');
    const page = await (passagem.cursor ? consulta.gt('id', passagem.cursor) : consulta).order('id', { ascending: true }).limit(pagina);
    if (page.error) {
      passagem.erros++; passagem.falha = 'consulta das conversas falhou';
      await gravarEstado(db, { ...estado, emAndamento: passagem }, agora);
      return { completa: false, ok: false, resumo: passagem };
    }
    const linhas = (page.data ?? []) as unknown as { id: string; owner_id: string; dados: Conversa }[];
    for (const linha of linhas) {
      try {
        const c = linha.dados;
        const cfg = configs.get(linha.owner_id) ?? lerConfigEncaminhamento(undefined);
        // Só conversas reais do WhatsApp (mensagem do canal UltraMsg): casos de demonstração nunca entram na fila.
        const doWhatsApp = !!c && Array.isArray(c.mensagens) && c.mensagens.some(m => m.canal === 'ultramsg');
        if (!doWhatsApp) passagem.foraDoWhatsApp = (passagem.foraDoWhatsApp ?? 0) + 1;
        if (doWhatsApp && cfg.ativo) {
          const base = await baseDoDono(linha.owner_id);
          const telefone = c.telefone ?? '';
          const local = base ? identificarNaBase(base, telefone) : undefined;
          const semEquipe = !c.mensagens.some(m => origemMensagem(m) === 'equipe');
          // Ausência na réplica filtrada não prova lead: com histórico da equipe, o vínculo fica em conferência.
          const identidade = local && (local.tipo !== 'nao_encontrado' || semEquipe) ? local : undefined;
          const processos = base && local?.tipo === 'unico' ? processosDaPessoa(base, local.pessoa.codigo) : [];
          const rel = relacionamentoAna(c, telefone, 'ultramsg', identidade, local?.tipo === 'unico' ? processos.length : undefined);
          const av = avaliarConversaAdvogado(c, { situacao: rel.situacao, agora, identificacaoIndisponivel: !base });
          passagem.contagem[av.tipo]++;
          if (av.tipo === 'ambigua') exemplo(passagem.exemplos.ambiguas, { conversaId: linha.id, motivo: av.motivo, desde: av.desde });
          if (av.tipo === 'antiga') exemplo(passagem.exemplos.antigas, { conversaId: linha.id, motivo: av.motivo, desde: av.desde });
          if (!base && (av.tipo === 'ambigua' || av.tipo === 'fora_escopo') && av.mensagens.length) {
            passagem.naoVerificadas++;
            exemplo(passagem.exemplos.naoVerificadas, { conversaId: linha.id, motivo: 'cadastro do ProJuris (réplica local) indisponível', desde: av.desde });
          }
          if (av.tipo === 'pendente' || av.tipo === 'ambigua') {
            const dados = { responsavel: cfg.responsavel, nomeCliente: local?.tipo === 'unico' ? local.pessoa.nome : c.agenteAna?.dados?.nome ?? '', telefone, processo: processoRelacionado(processos, c.mensagens.filter(m => m.de === 'cliente').slice(-8).map(m => m.texto)) };
            if (aplicarReconciliacao(c, av, dados, agora)) {
              let criada = false; let mudou = false;
              // Dentro do CAS: reavalia com a versão mais nova (mensagem nova ou resposta da equipe no meio).
              await atualizarConversa(db, linha.id, x => {
                const r = aplicarReconciliacao(x, avaliarConversaAdvogado(x, { situacao: rel.situacao, agora, identificacaoIndisponivel: !base }), dados, agora);
                criada = !!r?.criada; mudou = !!r;
                return r?.conversa ?? x;
              });
              if (criada) passagem.criadas++; else if (mudou) passagem.atualizadas++;
            }
          }
        }
      } catch {
        passagem.naoVerificadas++; passagem.erros++;
        exemplo(passagem.exemplos.naoVerificadas, { conversaId: linha.id, motivo: 'falha ao ler ou gravar a conversa' });
      }
      passagem.analisadas++;
      passagem.cursor = linha.id;
      if (relogio() - comeco > limite) {
        await gravarEstado(db, { ...estado, emAndamento: passagem }, agora);
        return { completa: false, ok: false, resumo: passagem };
      }
    }
    if (linhas.length < pagina) break;
  }
  const concluida: ReconciliacaoConcluida = { ...passagem, concluidaEm: agora.toISOString(), ok: passagem.erros === 0 };
  await gravarEstado(db, { emAndamento: undefined, ultimaCompleta: concluida }, agora);
  return { completa: true, ok: concluida.ok, resumo: concluida };
}
