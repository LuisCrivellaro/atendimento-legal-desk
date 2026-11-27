import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FUNCIONALIDADES, limitarNivel, type ChaveTextoAprovado, type ConfigSecretaria, type Funcionalidade, type NivelPermissao } from '@/lib/atendimento/secretaria/config';
import { dataHoraCurta } from '@/lib/atendimento';
import { PERGUNTA_ENCERRAMENTO } from '@/lib/atendimento/acompanhamento';
import { mergeReplies, textosColeta } from '@/lib/respostas-prontas';
import { CHAVES_TEMPLATE } from '@/lib/atendimento/secretaria/templates';
import { whatsappResponsavelValido } from '@/lib/atendimento/secretaria/encaminhamento-config';
import { lerConfigSecretariaAnne, salvarConfigSecretariaAnne } from '@/lib/atendimento/secretaria/secretaria.functions';
import { executar } from '@/lib/executar';

const NIVEIS: { valor: NivelPermissao; rotulo: string }[] = [
  { valor: 'automatico', rotulo: 'Automático' },
  { valor: 'aprovacao', rotulo: 'Com aprovação' },
  { valor: 'desligado', rotulo: 'Desligado' },
];
const ANTECEDENCIAS = [30, 45, 60, 90, 120, 180, 240];

/** Textos automáticos propostos (não oficiais) com a versão atual salva em Mensagens prontas. */
function textosParaAprovar(respostasProntas: Parameters<typeof textosColeta>[0]): { chave: ChaveTextoAprovado; titulo: string; texto: string }[] {
  const coleta = textosColeta(respostasProntas);
  const encerramento = mergeReplies(respostasProntas).find(r => r.id === PERGUNTA_ENCERRAMENTO.id)?.texto?.trim() || PERGUNTA_ENCERRAMENTO.texto;
  return [
    { chave: 'lembrete_contrato', titulo: 'Lembrete do contrato (24 h, até 3)', texto: coleta.lembreteContrato },
    { chave: 'lembrete_faltantes', titulo: 'Lembrete de documentos faltantes (48 h, até 3)', texto: coleta.lembreteFaltantes },
    { chave: 'pergunta_encerramento', titulo: 'Pergunta de encerramento depois de notícia aprovada', texto: encerramento },
  ];
}
const RETORNO = [{ valor: 'nunca', rotulo: 'Nunca (só a equipe devolve)' }, { valor: '12', rotulo: '12 h sem mensagem da equipe' }, { valor: '24', rotulo: '24 h sem mensagem da equipe' }, { valor: '48', rotulo: '48 h sem mensagem da equipe' }];

/**
 * Configuração da secretaria digital (dentro de "Automações do atendimento"): feature flag, permissões por
 * funcionalidade, prioridade humana, volta ao Automático, horário das automações e modelos fixos.
 * Só sênior/admin edita; a gravação é do servidor e nunca passa pelo modelo.
 */
export function AnneSecretariaConfig({ respostasProntas }: { respostasProntas?: Parameters<typeof textosColeta>[0] } = {}) {
  const ler = useServerFn(lerConfigSecretariaAnne);
  const salvar = useServerFn(salvarConfigSecretariaAnne);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['secretaria-config'], queryFn: () => ler(), staleTime: 30000, retry: false });
  const [c, setC] = useState<ConfigSecretaria | undefined>(undefined);
  useEffect(() => { if (data) setC(data.config); }, [data]);
  if (isLoading) return <p className="pt-4 text-xs text-muted-foreground">Carregando a secretaria digital…</p>;
  if (error || !data || !c) return <p className="pt-4 text-xs text-destructive">Configuração da secretaria indisponível.</p>;
  const editar = data.podeEditar;
  const mudar = (fn: (x: ConfigSecretaria) => ConfigSecretaria) => setC(x => (x ? fn(x) : x));
  const gravar = () => void executar('Salvar secretaria digital', async () => {
    if (c.testeAutomacoes.ativo && (c.testeAutomacoes.numero ?? '').length < 10) throw new Error('Informe o número autorizado (com DDD) para ligar o modo de teste.');
    const whatsappResponsavel = whatsappResponsavelValido(c.encaminhamento.whatsapp ?? '');
    if (!whatsappResponsavel) throw new Error('WhatsApp do advogado responsável: use 55 + DDD + celular, só números (ex.: 5511991737442).');
    const horarios = [...new Set(c.encaminhamento.horarios.filter(h => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(h)))].sort();
    if (!horarios.length) throw new Error('Informe ao menos um horário para o relatório do advogado.');
    const aprovacoesTexto = Object.fromEntries(Object.entries(c.aprovacoesTexto).flatMap(([k, v]) => (v ? [[k, { texto: v.texto }]] : [])));
    const r = await salvar({ data: { encaminhamento: { ...c.encaminhamento, responsavel: c.encaminhamento.responsavel.trim() || 'Fernando', whatsapp: whatsappResponsavel, horarios }, aprovacoesTexto, eventos: { ...c.eventos, antecedenciaAudiencia: c.eventos.antecedenciaAudiencia?.trim() || null }, ativa: c.ativa, permissoes: c.permissoes, janelaPrioridadeHumanaMin: c.janelaPrioridadeHumanaMin, retornoAutomaticoHoras: c.retornoAutomaticoHoras, janelaAutomacoes: c.janelaAutomacoes, confirmacaoAntecedenciaMin: c.confirmacaoAntecedenciaMin, testeAutomacoes: c.testeAutomacoes, templates: Object.fromEntries(Object.entries(c.templates).filter(([k, v]) => (CHAVES_TEMPLATE as string[]).includes(k) && !!v?.trim())) as Record<string, string> } });
    await qc.invalidateQueries({ queryKey: ['secretaria-config'] });
    return r;
  });
  return (
    <section aria-label="Secretaria digital" className="space-y-3 border-t pt-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">Secretaria digital (Anne em duas camadas)</h3>
          <p className="text-xs text-muted-foreground">Com a equipe na conversa, a Anne continua só com as automações autorizadas (modo Híbrido). Desligada, tudo segue como antes.</p>
          {data.chaveMestraDesligada && <p className="text-xs font-medium text-destructive">Desligada pelo servidor (ANNE_SECRETARIA_DESLIGADA).</p>}
        </div>
        <span title={!editar ? 'Só sênior/admin altera' : undefined}><Switch checked={c.ativa} disabled={!editar} onCheckedChange={v => mudar(x => ({ ...x, ativa: v }))} aria-label="Ligar secretaria digital" /></span>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Permissões por funcionalidade</p>
        {(Object.keys(FUNCIONALIDADES) as Funcionalidade[]).map(f => (
          <label key={f} className="flex items-center justify-between gap-3 border-b py-1.5">
            <span className="min-w-0">
              <span className="block">{FUNCIONALIDADES[f].titulo}</span>
              <span className="block text-xs text-muted-foreground">{FUNCIONALIDADES[f].descricao}</span>
            </span>
            <Select value={c.permissoes[f]} disabled={!editar} onValueChange={v => mudar(x => ({ ...x, permissoes: { ...x.permissoes, [f]: limitarNivel(f, v as NivelPermissao) } }))}>
              <SelectTrigger className="h-8 w-40 shrink-0 text-xs" aria-label={`Permissão: ${FUNCIONALIDADES[f].titulo}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {NIVEIS.map(n => <SelectItem key={n.valor} value={n.valor} disabled={limitarNivel(f, n.valor) !== n.valor}>{n.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Prioridade humana (minutos)</span>
          <Input type="number" min={0} max={1440} value={c.janelaPrioridadeHumanaMin} disabled={!editar} onChange={e => mudar(x => ({ ...x, janelaPrioridadeHumanaMin: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) }))} />
          <span className="block text-xs text-muted-foreground">Automações não urgentes esperam a equipe; as urgentes viram aviso.</span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Volta ao Automático</span>
          <Select value={c.retornoAutomaticoHoras === null ? 'nunca' : String(c.retornoAutomaticoHoras)} disabled={!editar} onValueChange={v => mudar(x => ({ ...x, retornoAutomaticoHoras: v === 'nunca' ? null : Number(v) }))}>
            <SelectTrigger className="h-9 text-xs" aria-label="Volta ao Automático"><SelectValue /></SelectTrigger>
            <SelectContent>{RETORNO.map(r => <SelectItem key={r.valor} value={r.valor}>{r.rotulo}</SelectItem>)}</SelectContent>
          </Select>
          <span className="block text-xs text-muted-foreground">Nunca vale para Humano/Bloqueado escolhidos pela equipe.</span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Horário das automações (início e fim)</span>
          <span className="flex gap-2">
            <Input type="time" value={c.janelaAutomacoes.inicio} disabled={!editar} onChange={e => mudar(x => ({ ...x, janelaAutomacoes: { ...x.janelaAutomacoes, inicio: e.target.value } }))} aria-label="Início das automações" />
            <Input type="time" value={c.janelaAutomacoes.fim} disabled={!editar} onChange={e => mudar(x => ({ ...x, janelaAutomacoes: { ...x.janelaAutomacoes, fim: e.target.value } }))} aria-label="Fim das automações" />
          </span>
        </label>
        <label className="flex items-center justify-between gap-3 self-end py-2">
          <span className="text-xs">Só em dias úteis</span>
          <Switch checked={c.janelaAutomacoes.diasUteis} disabled={!editar} onCheckedChange={v => mudar(x => ({ ...x, janelaAutomacoes: { ...x.janelaAutomacoes, diasUteis: v } }))} aria-label="Só em dias úteis" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Confirmação de presença (antecedência)</span>
          <Select value={String(c.confirmacaoAntecedenciaMin)} disabled={!editar} onValueChange={v => mudar(x => ({ ...x, confirmacaoAntecedenciaMin: Number(v) }))}>
            <SelectTrigger className="h-9 text-xs" aria-label="Antecedência da confirmação de presença"><SelectValue /></SelectTrigger>
            <SelectContent>{[...new Set([...ANTECEDENCIAS, c.confirmacaoAntecedenciaMin])].sort((a, b) => a - b).map(a => <SelectItem key={a} value={String(a)}>{a >= 60 ? `${a / 60} h antes` : `${a} min antes`}</SelectItem>)}</SelectContent>
          </Select>
          <span className="block text-xs text-muted-foreground">Não sai se o cliente já confirmou ou se a equipe já falou da consulta hoje. O lembrete das 08h continua.</span>
        </label>
        <div className="space-y-1">
          <label className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">Modo de teste das automações</span>
            <Switch checked={c.testeAutomacoes.ativo} disabled={!editar} onCheckedChange={v => mudar(x => ({ ...x, testeAutomacoes: { ...x.testeAutomacoes, ativo: v } }))} aria-label="Modo de teste das automações" />
          </label>
          <Input inputMode="tel" placeholder="Número autorizado com DDD (ex.: 5511999999999)" value={c.testeAutomacoes.numero ?? ''} disabled={!editar} onChange={e => mudar(x => ({ ...x, testeAutomacoes: { ...x.testeAutomacoes, numero: e.target.value.replace(/\D/g, '').slice(0, 15) || null } }))} aria-label="Número autorizado para teste" />
          <span className="block text-xs text-muted-foreground">Ligado, lembretes, confirmações e reagendamentos automáticos só vão para este número; os demais clientes ficam sem automação (com aviso no monitor).</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Lembrete de audiência presencial (T04)</span>
          <Select value={String(c.eventos.diasLembreteAudiencia)} disabled={!editar} onValueChange={v => mudar(x => ({ ...x, eventos: { ...x.eventos, diasLembreteAudiencia: Number(v) } }))}>
            <SelectTrigger className="h-9 text-xs" aria-label="Antecedência do lembrete de audiência"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 5, 7].map(d => <SelectItem key={d} value={String(d)}>{d === 1 ? 'Véspera (1 dia antes)' : `${d} dias antes`}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Pedir confirmação de recebimento (T11.2/T12.3)</span>
          <Select value={c.eventos.diasConfirmacaoEvento === null ? 'nao' : String(c.eventos.diasConfirmacaoEvento)} disabled={!editar} onValueChange={v => mudar(x => ({ ...x, eventos: { ...x.eventos, diasConfirmacaoEvento: v === 'nao' ? null : Number(v) } }))}>
            <SelectTrigger className="h-9 text-xs" aria-label="Confirmação de recebimento de audiência/perícia"><SelectValue /></SelectTrigger>
            <SelectContent>{[['nao', 'Não pedir'], ['2', '2 dias antes'], ['3', '3 dias antes'], ['7', '7 dias antes']].map(([v, r]) => <SelectItem key={v} value={v!}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Antecedência para o T11.2 ([antecedência])</span>
          <Input value={c.eventos.antecedenciaAudiencia ?? ''} maxLength={60} placeholder="ex.: uma hora de antecedência" disabled={!editar} onChange={e => mudar(x => ({ ...x, eventos: { ...x.eventos, antecedenciaAudiencia: e.target.value.trim() ? e.target.value : null } }))} />
        </label>
      </div>
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Encaminhamento de clientes ativos ao advogado</p>
            <p className="text-xs text-muted-foreground">Cliente ativo com dúvida, questão jurídica ou pedido para falar com a Dra. recebe a mensagem fixa e entra na fila do advogado. Agenda, confirmações e notícias do processo continuam com a Anne.</p>
          </div>
          <Switch checked={c.encaminhamento.ativo} disabled={!editar} onCheckedChange={v => mudar(x => ({ ...x, encaminhamento: { ...x.encaminhamento, ativo: v } }))} aria-label="Ligar encaminhamento ao advogado" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Advogado responsável</span>
            <Input value={c.encaminhamento.responsavel} maxLength={60} disabled={!editar} onChange={e => mudar(x => ({ ...x, encaminhamento: { ...x.encaminhamento, responsavel: e.target.value } }))} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">WhatsApp do relatório (55 + DDD + celular)</span>
            <Input inputMode="tel" value={c.encaminhamento.whatsapp ?? ''} disabled={!editar} onChange={e => mudar(x => ({ ...x, encaminhamento: { ...x.encaminhamento, whatsapp: e.target.value.replace(/\D/g, '').slice(0, 13) || null } }))} aria-label="WhatsApp do advogado responsável" />
          </label>
          <div className="space-y-1">
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">Relatório de pendências</span>
              <Switch checked={c.encaminhamento.relatorioAtivo} disabled={!editar} onCheckedChange={v => mudar(x => ({ ...x, encaminhamento: { ...x.encaminhamento, relatorioAtivo: v } }))} aria-label="Ligar relatório de pendências" />
            </label>
            <span className="flex gap-2">
              {[0, 1].map(i => <Input key={i} type="time" value={c.encaminhamento.horarios[i] ?? ''} disabled={!editar} aria-label={`Horário ${i + 1} do relatório`} onChange={e => mudar(x => { const h = [...x.encaminhamento.horarios]; h[i] = e.target.value; return { ...x, encaminhamento: { ...x.encaminhamento, horarios: h.filter(Boolean) } }; })} />)}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Uma mensagem consolidada por horário (horário de Brasília), só para este número; o envio não muda a situação das pendências.</p>
      </div>
      <p className="text-xs text-muted-foreground">T04, T11.2, T12.2 e T12.3 só saem sozinhos depois que a Dra. ativar o modelo na biblioteca oficial; até lá, a equipe recebe o texto pronto. O T12.2 sai na véspera da perícia em dia útil (se a véspera não for dia útil, vira pendência antecipada).</p>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Textos fora da biblioteca oficial: só saem sozinhos com o texto exato aprovado pela Dra.</p>
        {textosParaAprovar(respostasProntas).map(t => {
          const salvo = c.aprovacoesTexto[t.chave];
          const aprovado = salvo?.texto === t.texto;
          return (
            <label key={t.chave} className="flex items-start justify-between gap-3 border-b py-1.5">
              <span className="min-w-0">
                <span className="block">{t.titulo}</span>
                <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">{t.texto}</span>
                {salvo && !aprovado && <span className="block text-xs font-medium text-destructive">O texto mudou depois da aprovação: aprove de novo para voltar a sair sozinho.</span>}
                {aprovado && salvo?.por && <span className="block text-xs text-muted-foreground">Aprovado por {salvo.por}{salvo.em ? ` em ${dataHoraCurta(salvo.em)}` : ''}.</span>}
                {!salvo && <span className="block text-xs text-muted-foreground">Sem aprovação: a equipe recebe o texto pronto para enviar.</span>}
              </span>
              <span title={!editar ? 'Só sênior/admin aprova' : undefined}>
                <Switch checked={aprovado} disabled={!editar} aria-label={`Aprovar texto: ${t.titulo}`} onCheckedChange={v => mudar(x => ({ ...x, aprovacoesTexto: Object.fromEntries([...Object.entries(x.aprovacoesTexto).filter(([k]) => k !== t.chave), ...(v ? [[t.chave, { texto: t.texto }]] : [])]) as ConfigSecretaria['aprovacoesTexto'] }))} />
              </span>
            </label>
          );
        })}
      </div>

      {editar && <Button size="sm" onClick={gravar}>Salvar secretaria digital</Button>}
      {c.atualizadoEm && <p className="text-xs text-muted-foreground">Última alteração por {c.atualizadoPor ?? 'equipe'}.</p>}
    </section>
  );
}
