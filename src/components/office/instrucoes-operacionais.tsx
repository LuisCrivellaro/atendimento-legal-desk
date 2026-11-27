import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Pencil, Plus, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Section } from './shared';
import {
  CATEGORIAS_INSTRUCAO, ROTULO_PRIORIDADE, ROTULO_SITUACAO, dataHoraSP, situacaoInstrucao, tempoAte,
  type InstrucaoOperacional, type PrioridadeInstrucao, type SituacaoInstrucao,
} from '@/lib/atendimento/instrucoes-operacionais';
import { desativarInstrucaoAnne, interpretarInstrucaoAnne, lerInstrucoesOperacionaisAnne, salvarInstrucaoAnne } from '@/lib/atendimento/instrucoes-operacionais.functions';

/** Campos datetime-local no horário de Brasília (America/Sao_Paulo, -03:00 fixo desde 2019), independentemente do navegador. */
const paraCampo = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(0, 16) : '');
const doCampo = (v: string) => (v ? new Date(`${v}:00-03:00`).toISOString() : undefined);

interface Ajustes { titulo: string; categoria: string; prioridade: PrioridadeInstrucao; tipo: 'temporaria' | 'permanente'; inicio: string; fim: string; semFim: boolean; bloqueioInicio: string; bloqueioFim: string; temBloqueio: boolean; somenteOrientacao: boolean }
type Previa = Awaited<ReturnType<typeof interpretarInstrucaoAnne>>;

const corPrioridade: Record<PrioridadeInstrucao, 'destructive' | 'default' | 'secondary' | 'outline'> = { critica: 'destructive', alta: 'default', normal: 'secondary', baixa: 'outline' };

/**
 * Avisos e instruções operacionais da Anne (Treinamento de IA → Orientações). A equipe escreve em linguagem natural;
 * o servidor interpreta (datas absolutas em horário de Brasília), mostra a prévia e só ativa depois da confirmação.
 * Criar, editar e desativar: advogada sênior ou admin. Vale imediatamente para a Anne e as rotinas.
 */
export function InstrucoesOperacionais() {
  const ler = useServerFn(lerInstrucoesOperacionaisAnne);
  const interpretar = useServerFn(interpretarInstrucaoAnne);
  const salvar = useServerFn(salvarInstrucaoAnne);
  const desativar = useServerFn(desativarInstrucaoAnne);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['instrucoes-operacionais-anne'], queryFn: () => ler(), staleTime: 30000, retry: false });
  const [texto, setTexto] = useState('');
  const [editandoId, setEditandoId] = useState<string | undefined>();
  const [previa, setPrevia] = useState<Previa | undefined>();
  const [ajustes, setAjustes] = useState<Ajustes | undefined>();
  const [confirmado, setConfirmado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  // Situação e tempo restante recalculados na tela a cada 30 s (a validade é absoluta; nada é consultado de novo).
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 30000); return () => clearInterval(t); }, []);
  const recarregar = () => qc.invalidateQueries({ queryKey: ['instrucoes-operacionais-anne'] });

  const grupos = useMemo(() => {
    const g: Record<SituacaoInstrucao, InstrucaoOperacional[]> = { ativa: [], programada: [], expirada: [], desativada: [] };
    for (const i of data?.lista ?? []) g[situacaoInstrucao(i, agora)].push(i);
    const ordem: Record<PrioridadeInstrucao, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };
    g.ativa.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
    g.programada.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return g;
  }, [data, agora]);

  const ajustesParaEnvio = (a: Ajustes | undefined) => a ? {
    titulo: a.titulo, categoria: a.categoria, prioridade: a.prioridade, tipo: a.tipo,
    ...(doCampo(a.inicio) ? { inicio: doCampo(a.inicio) } : {}),
    fim: a.tipo === 'permanente' || a.semFim ? null : doCampo(a.fim) ?? null,
    ...(!a.somenteOrientacao && a.temBloqueio && doCampo(a.bloqueioInicio) && doCampo(a.bloqueioFim) ? { periodoBloqueio: { inicio: doCampo(a.bloqueioInicio)!, fim: doCampo(a.bloqueioFim)! } } : {}),
    ...(a.somenteOrientacao ? { somenteOrientacao: true } : {}),
  } : undefined;

  const verPrevia = async (comAjustes: boolean) => {
    if (!texto.trim()) return;
    setBusy(true); setConfirmado(false);
    try {
      const enviar = comAjustes ? ajustesParaEnvio(ajustes) : undefined;
      const r = await interpretar({ data: { texto, ...(editandoId ? { id: editandoId } : {}), ...(enviar ? { ajustes: enviar } : {}) } });
      setPrevia(r);
      if (!comAjustes && r.interpretacao) {
        const i = r.interpretacao;
        const bloqueio = i.regras.find(x => x.tipo === 'bloquear_periodo_agenda');
        const precisaPeriodo = i.esclarecer.some(e => /per[ií]odo a bloquear|datas das f[eé]rias/.test(e));
        setAjustes({
          titulo: i.titulo, categoria: i.categoria, prioridade: i.prioridade, tipo: i.tipo,
          inicio: paraCampo(r.final?.inicio ?? i.inicio), fim: paraCampo(r.final?.fim ?? i.fim), semFim: (r.final?.fim ?? i.fim) === null,
          temBloqueio: !!bloqueio || precisaPeriodo, somenteOrientacao: false,
          bloqueioInicio: bloqueio && 'inicio' in bloqueio ? paraCampo(bloqueio.inicio) : '', bloqueioFim: bloqueio && 'fim' in bloqueio ? paraCampo(bloqueio.fim) : '',
        });
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível interpretar a instrução.'); } finally { setBusy(false); }
  };

  const ativar = async () => {
    const enviar = ajustesParaEnvio(ajustes);
    if (!previa?.ok || !confirmado || !enviar) return;
    setBusy(true);
    try {
      const r = await salvar({ data: { texto, ...(editandoId ? { id: editandoId } : {}), ajustes: enviar, confirmado: true } });
      toast.success(`${editandoId ? 'Instrução atualizada' : 'Instrução ativada'}: vale ${r.instrucao.situacao === 'programada' ? `a partir de ${dataHoraSP(r.instrucao.inicio)}` : 'agora'}.${r.consultasSinalizadas ? ` ${r.consultasSinalizadas} consulta(s) já marcada(s) sinalizada(s) para a equipe.` : ''}`);
      setTexto(''); setEditandoId(undefined); setPrevia(undefined); setAjustes(undefined); setConfirmado(false);
      await recarregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível ativar a instrução.'); } finally { setBusy(false); }
  };

  const editar = (i: InstrucaoOperacional) => {
    setTexto(i.texto); setEditandoId(i.id); setPrevia(undefined); setConfirmado(false);
    const bloqueio = i.regras.find(x => x.tipo === 'bloquear_periodo_agenda');
    setAjustes({ titulo: i.titulo, categoria: i.categoria, prioridade: i.prioridade, tipo: i.tipo, inicio: paraCampo(i.inicio), fim: paraCampo(i.fim), semFim: i.fim === null, temBloqueio: !!bloqueio, somenteOrientacao: i.regras.every(r => r.tipo === 'comportamental'), bloqueioInicio: bloqueio && 'inicio' in bloqueio ? paraCampo(bloqueio.inicio) : '', bloqueioFim: bloqueio && 'fim' in bloqueio ? paraCampo(bloqueio.fim) : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const desligar = async (i: InstrucaoOperacional) => {
    if (!window.confirm(`Desativar agora a instrução "${i.titulo}"? A Anne deixa de segui-la imediatamente; o registro fica no histórico.`)) return;
    setBusy(true);
    try { await desativar({ data: { id: i.id } }); toast.success('Instrução desativada.'); await recarregar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível desativar.'); } finally { setBusy(false); }
  };

  const podeEditar = !!data?.podeEditar;
  const set = (p: Partial<Ajustes>) => { setAjustes(a => (a ? { ...a, ...p } : a)); setConfirmado(false); };

  const cartao = (i: InstrucaoOperacional) => {
    const s = situacaoInstrucao(i, agora);
    return (
      <article key={i.id} className="rounded-md border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={corPrioridade[i.prioridade]}>{ROTULO_PRIORIDADE[i.prioridade]}</Badge>
          <Badge variant="outline">{ROTULO_SITUACAO[s]}</Badge>
          <span className="text-xs text-muted-foreground">{CATEGORIAS_INSTRUCAO[i.categoria] ?? i.categoria} · {i.tipo === 'permanente' ? 'Permanente' : 'Temporária'}</span>
        </div>
        <p className="mt-2 font-medium">{i.titulo}</p>
        {i.titulo !== i.texto && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{i.texto}</p>}
        <p className="mt-1 text-xs">{i.interpretacao}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {s === 'ativa' && (i.fim ? `Termina em ${dataHoraSP(i.fim)} · restam ${tempoAte(i.fim, agora)}` : 'Sem término: vale até ser desativada')}
          {s === 'programada' && `Começa em ${dataHoraSP(i.inicio)} (em ${tempoAte(i.inicio, agora)})`}
          {s === 'expirada' && `Expirou em ${dataHoraSP(i.fim)}`}
          {s === 'desativada' && `Desativada${i.desativadoPor ? ` por ${i.desativadoPor}` : ''}${i.desativadoEm ? ` em ${dataHoraSP(i.desativadoEm)}` : ''}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Criada por {i.criadoPor} em {dataHoraSP(i.criadoEm)}{i.atualizadoPor ? ` · editada por ${i.atualizadoPor} em ${dataHoraSP(i.atualizadoEm ?? null)} (versão ${i.versao})` : ''}</p>
        {podeEditar && (s === 'ativa' || s === 'programada') && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => editar(i)}><Pencil />Editar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void desligar(i)}><Power />Desativar agora</Button>
          </div>
        )}
      </article>
    );
  };
  const lista = (titulo: string, itens: InstrucaoOperacional[], vazio: string) => (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{titulo} ({itens.length})</h3>
      {itens.length ? itens.map(cartao) : <p className="text-xs text-muted-foreground">{vazio}</p>}
    </div>
  );

  return (
    <Section title="Avisos e instruções operacionais">
      <p className="mb-3 text-sm text-muted-foreground">
        Avisos com prazo para a Anne e as automações (ex.: “Não agendar consultas para as próximas 2 horas”). Valem na hora, sem republicar,
        e expiram sozinhos. Nunca liberam o que as regras de segurança, de agenda ou da OAB proíbem; consultas já marcadas nunca são canceladas ou
        alteradas por uma instrução. Horários em horário de Brasília.
      </p>
      {isLoading ? <p className="text-xs text-muted-foreground">Carregando instruções…</p> : error ? <p className="text-xs text-destructive">Instruções indisponíveis.</p> : (
        <div className="space-y-6">
          {podeEditar ? (
            <div className="space-y-3 rounded-md border p-3">
              <Textarea aria-label="Nova instrução operacional" value={texto} onChange={e => { setTexto(e.target.value); setPrevia(undefined); setConfirmado(false); }} placeholder="Escreva a instrução como falaria com a Anne. Ex.: Não agendar consultas amanhã das 14h às 17h." className="min-h-24" />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !texto.trim()} onClick={() => void verPrevia(false)}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}{editandoId ? 'Reinterpretar' : 'Adicionar instrução'}</Button>
                {editandoId && <Button variant="ghost" disabled={busy} onClick={() => { setEditandoId(undefined); setTexto(''); setPrevia(undefined); setAjustes(undefined); }}>Cancelar edição</Button>}
              </div>
              {previa && ajustes && (
                <div className="space-y-3 rounded-md bg-muted p-3 text-sm" aria-label="Interpretação da Anne">
                  <p className="font-medium">Como a Anne entendeu</p>
                  {previa.final ? <p>{previa.final.interpretacao}</p> : previa.interpretacao && <p>{previa.interpretacao.resumo}</p>}
                  {previa.interpretacao?.afeta.length ? <ul className="list-disc pl-5 text-xs">{previa.interpretacao.afeta.map(a => <li key={a}>{a}</li>)}</ul> : null}
                  {previa.avisos.map(a => <p key={a} className="text-xs text-muted-foreground">• {a}</p>)}
                  {previa.erros.map(e => <p key={e} className="flex gap-1 text-xs font-medium text-destructive"><AlertTriangle className="size-3 shrink-0" />{e}</p>)}
                  {previa.consultas.length > 0 && (
                    <div className="text-xs">
                      <p className="font-medium">Consultas já marcadas nesse período ({previa.consultas.length}) — serão sinalizadas à equipe; nada é cancelado ou alterado:</p>
                      <ul className="list-disc pl-5">{previa.consultas.map(c => <li key={`${c.conversaId}${c.inicio}`}>{c.nome} · {c.quando}</li>)}</ul>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs">Título<Input value={ajustes.titulo} onChange={e => set({ titulo: e.target.value })} /></label>
                    <label className="text-xs">Categoria
                      <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={ajustes.categoria} onChange={e => set({ categoria: e.target.value })}>
                        {Object.entries(CATEGORIAS_INSTRUCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="text-xs">Prioridade
                      <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={ajustes.prioridade} onChange={e => set({ prioridade: e.target.value as PrioridadeInstrucao })}>
                        {Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="text-xs">Tipo
                      <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={ajustes.tipo} onChange={e => set({ tipo: e.target.value as Ajustes['tipo'] })}>
                        <option value="temporaria">Temporária</option><option value="permanente">Permanente</option>
                      </select>
                    </label>
                    <label className="text-xs">Início da validade<Input type="datetime-local" value={ajustes.inicio} onChange={e => set({ inicio: e.target.value })} /></label>
                    <label className="text-xs">Término da validade
                      <Input type="datetime-local" value={ajustes.fim} disabled={ajustes.semFim || ajustes.tipo === 'permanente'} onChange={e => set({ fim: e.target.value })} />
                      <span className="mt-1 flex items-center gap-1"><input type="checkbox" checked={ajustes.semFim || ajustes.tipo === 'permanente'} disabled={ajustes.tipo === 'permanente'} onChange={e => set({ semFim: e.target.checked })} /> Sem término (até ser desativada)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={ajustes.somenteOrientacao} onChange={e => set({ somenteOrientacao: e.target.checked })} /> Tratar só como orientação para a Anne (sem bloqueio automático) — use quando a leitura automática não corresponder à intenção</label>
                    {ajustes.temBloqueio && !ajustes.somenteOrientacao && <>
                      <label className="text-xs">Bloquear horários a partir de<Input type="datetime-local" value={ajustes.bloqueioInicio} onChange={e => set({ bloqueioInicio: e.target.value })} /></label>
                      <label className="text-xs">Bloquear horários até<Input type="datetime-local" value={ajustes.bloqueioFim} onChange={e => set({ bloqueioFim: e.target.value })} /></label>
                    </>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void verPrevia(true)}>Atualizar prévia com os ajustes</Button>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmado} disabled={!previa.ok} onChange={e => setConfirmado(e.target.checked)} /> Confirmo a interpretação, a validade e as funções afetadas</label>
                    <Button size="sm" disabled={busy || !previa.ok || !confirmado} onClick={() => void ativar()}><CheckCircle2 />{editandoId ? 'Salvar alteração' : 'Ativar instrução'}</Button>
                  </div>
                  {!previa.ok && <p className="text-xs text-muted-foreground">Ajuste o texto ou os campos e clique em “Atualizar prévia”: a instrução só é ativada sem pendências.</p>}
                </div>
              )}
            </div>
          ) : <p className="text-xs text-muted-foreground">Somente advogada sênior ou admin cria, edita ou desativa instruções. Você pode acompanhar as vigentes abaixo.</p>}
          <div className="grid gap-6 lg:grid-cols-2">
            {lista('Ativas', grupos.ativa, 'Nenhuma instrução ativa.')}
            {lista('Programadas', grupos.programada, 'Nenhuma instrução programada.')}
          </div>
          {lista('Expiradas e desativadas (histórico)', [...grupos.expirada, ...grupos.desativada].sort((a, b) => (b.desativadoEm ?? b.fim ?? '').localeCompare(a.desativadoEm ?? a.fim ?? '')).slice(0, 30), 'Nenhuma instrução encerrada.')}
        </div>
      )}
    </Section>
  );
}
