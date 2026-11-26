import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { dataHoraCurta } from '@/lib/atendimento';
import { monitorAtrasado, ROTULOS_ETAPA } from '@/lib/atendimento/monitor-estado';
import { lerMonitorOperacionalAnne, lerSaudeMonitorAnne, retomarIAAnne } from '@/lib/atendimento/secretaria/secretaria.functions';

const ROTULO_PROGRAMADA = { lembrete: 'Lembrete 08h', confirmacao: 'Confirmação de presença' } as const;

function resumoTexto(r: Record<string, unknown> | undefined) {
  if (!r) return '';
  const partes: string[] = [];
  for (const [k, v] of Object.entries(r)) {
    if (k === 'motivos' || typeof v === 'object') continue;
    if (typeof v === 'number' && v === 0) continue;
    partes.push(`${k}: ${String(v)}`);
  }
  return partes.join(' · ');
}

/** Painel do monitor operacional (dentro de "Automações do atendimento"). */
export function MonitorAutomacoes() {
  const ler = useServerFn(lerMonitorOperacionalAnne);
  const { data, isLoading, error } = useQuery({ queryKey: ['monitor-operacional'], queryFn: () => ler(), staleTime: 60000, refetchInterval: 120000, retry: false });
  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando o monitor das automações…</p>;
  if (error || !data) return <p className="text-xs text-destructive">Monitor das automações indisponível.</p>;
  const e = data.estado;
  const atrasado = monitorAtrasado(e);
  const motivos = new Map<string, number>();
  for (const etapa of Object.values(e?.etapas ?? {})) {
    const m = etapa.resumo?.['motivos'];
    if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) motivos.set(k, (motivos.get(k) ?? 0) + v);
  }
  const falhas = Object.entries(e?.etapas ?? {}).filter(([, r]) => !r.ok && !r.pulada);
  return (
    <section aria-label="Monitor das automações" className="space-y-2 border-b pb-4 text-sm">
      <div className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${atrasado ? 'border-destructive/40 bg-destructive/10 text-destructive' : falhas.length ? 'border-pending-foreground/30 bg-pending text-pending-foreground' : 'border-primary/20 bg-primary/5'}`}>
        {atrasado ? <AlertTriangle className="size-4 shrink-0" /> : falhas.length ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-primary" />}
        <div className="min-w-0">
          <p className="font-medium">{atrasado ? (e ? `Automações paradas: última execução ${dataHoraCurta(e.ultimaExecucao)}` : 'Automações nunca executaram no servidor') : falhas.length ? 'Automações rodando, com falhas em algumas etapas' : 'Automações funcionando'}</p>
          {e && <p>Última execução {dataHoraCurta(e.ultimaExecucao)} · próxima prevista {dataHoraCurta(e.proximaPrevista)} · ProJuris {e.integracoes.projuris === 'ok' ? 'ok' : e.integracoes.projuris === 'falha' ? 'indisponível' : 'não verificado'} · WhatsApp {e.integracoes.whatsapp}</p>}
          {atrasado && <p>A rotina do servidor não está rodando: confira o agendamento "monitorar-ana" a cada 5 minutos (docs/automacoes-operacionais.md). Nada é enviado enquanto ela estiver parada.</p>}
          {data.testeAutomacoes.ativo && <p className="font-medium">Modo de teste ligado: só o número autorizado recebe automações.</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Confirmação de presença {data.antecedenciaMin >= 60 ? `${data.antecedenciaMin / 60} h` : `${data.antecedenciaMin} min`} antes · {data.enviadasHoje} mensagem(ns) automática(s) enviada(s) hoje.</p>
      {e && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Etapas da última execução</summary>
          <ul className="space-y-0.5 pt-1 text-xs">
            {Object.entries(e.etapas).map(([nome, r]) => (
              <li key={nome}><span className={r.ok ? '' : 'font-medium text-destructive'}>{ROTULOS_ETAPA[nome] ?? nome}</span>: {r.pulada ? r.pulada : r.ok ? (resumoTexto(r.resumo) || 'ok') : `falha (${r.erro ?? 'sem detalhe'})`}</li>
            ))}
          </ul>
        </details>
      )}
      {!!motivos.size && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Mensagens que não saíram (motivos)</summary>
          <ul className="space-y-0.5 pt-1 text-xs">{[...motivos].map(([m, n]) => <li key={m}>{n}× {m}</li>)}</ul>
        </details>
      )}
      <details open={data.programadas.length > 0 && data.programadas.length <= 6}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Mensagens programadas (próximas 36 h): {data.programadas.filter(p => p.estado === 'prevista').length}</summary>
        <ul className="space-y-0.5 pt-1 text-xs">
          {data.programadas.length ? data.programadas.map(p => (
            <li key={`${p.conversaId}:${p.tipo}`} className="flex flex-wrap items-center gap-1">
              <Clock className="size-3 text-muted-foreground" />{dataHoraCurta(p.quando)} · {ROTULO_PROGRAMADA[p.tipo]} · {p.nome}
              {' · '}<span className={p.estado === 'nao_sai' ? 'font-medium text-destructive' : p.estado === 'enviada' ? 'text-primary' : ''}>{p.estado === 'prevista' ? 'prevista' : p.estado === 'enviada' ? 'enviada' : `não sai: ${p.motivo ?? ''}`}</span>
            </li>
          )) : <li className="text-muted-foreground">Nenhuma consulta nas próximas 36 h.</li>}
        </ul>
      </details>
      {!!e?.pendenciasAgenda.length && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-destructive">Compromissos do ProJuris sem vínculo seguro: {e.pendenciasAgenda.length}</summary>
          <ul className="space-y-0.5 pt-1 text-xs">{e.pendenciasAgenda.map((p, i) => <li key={i}>{dataHoraCurta(p.quando)}{p.titulo ? ` · ${p.titulo}` : ''} · {p.motivo}</li>)}</ul>
          <p className="pt-1 text-xs text-muted-foreground">Para a Anne reconhecer consultas marcadas direto no ProJuris, coloque o telefone do cliente no título ou na descrição do compromisso.</p>
        </details>
      )}
      {!!e?.historico.length && <p className="text-xs text-muted-foreground">Últimas execuções: {e.historico.slice(0, 6).map(h => `${dataHoraCurta(h.em).split(' · ')[1] ?? ''}${h.ok ? '' : '⚠'}`).join(' · ')}</p>}
    </section>
  );
}

/** Alerta global no Atendimento quando a rotina do servidor parou (sem execução há mais de 15 min). */
export function AlertaMonitorParado() {
  const ler = useServerFn(lerSaudeMonitorAnne);
  const { data } = useQuery({ queryKey: ['monitor-saude'], queryFn: () => ler(), staleTime: 120000, refetchInterval: 300000, retry: false });
  if (!data || !monitorAtrasado(data.ultimaExecucao ? { ultimaExecucao: data.ultimaExecucao } : null)) return null;
  return (
    <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>{data.ultimaExecucao ? `Automações da Anne paradas desde ${dataHoraCurta(data.ultimaExecucao)}` : 'Automações da Anne ainda não rodaram no servidor'}: lembretes e confirmações não estão saindo. Veja Automações do atendimento.</span>
    </div>
  );
}

/**
 * Aviso no Atendimento quando a IA da Anne está pausada (chave do provedor recusada): o que continua, o que espera e,
 * para sênior/admin, o botão que testa a chave e retoma. O servidor também testa sozinho a cada 5 minutos.
 */
export function AlertaPausaIA() {
  const ler = useServerFn(lerSaudeMonitorAnne);
  const retomar = useServerFn(retomarIAAnne);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['monitor-saude'], queryFn: () => ler(), staleTime: 120000, refetchInterval: 300000, retry: false });
  const acao = useMutation({
    mutationFn: () => retomar(),
    onSuccess: r => {
      if (r.ok) toast.success(r.reenfileiradas ? `IA da Anne retomada. ${r.reenfileiradas} mensagem(ns) recebida(s) na pausa serão respondidas em instantes.` : 'IA da Anne retomada.');
      else toast.error(`${r.motivo} A IA continua pausada.`);
      void qc.invalidateQueries({ queryKey: ['monitor-saude'] });
    },
    onError: e => toast.error((e as Error).message || 'Não foi possível retomar a IA da Anne.'),
  });
  const p = data?.pausaIA;
  if (!p) return null;
  return (
    <div role="status" className="flex shrink-0 items-start gap-2 border-b border-pending-foreground/30 bg-pending px-3 py-1.5 text-xs text-pending-foreground">
      <PauseCircle className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p><span className="font-medium">IA da Anne pausada{p.desde ? ` desde ${dataHoraCurta(p.desde)}` : ''}.</span> {p.motivo}</p>
        <p>Confirmações, lembretes, cobrança de documentos e reagendamentos continuam. Mensagens novas esperam e são respondidas quando a chave voltar a funcionar (teste automático a cada 5 minutos).</p>
        {data.podeRetomar && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={acao.isPending} onClick={() => acao.mutate()}>{acao.isPending ? 'Testando a chave…' : 'Testar a chave e retomar'}</Button>}
      </div>
    </div>
  );
}
