import { useServerFn } from '@tanstack/react-start';
import { Ban, Bot, CalendarCheck, CalendarClock, CalendarX, ClipboardList, History, Pause, Play, UserRound, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AIMode } from '@/lib/atendimento';
import { dataHoraCurta } from '@/lib/atendimento';
import type { Conversa, Mensagem } from '@/lib/mock-data';
import { automacoesAtivas, ROTULOS_ESTADO, ROTULOS_TIPO } from '@/lib/atendimento/secretaria/automacoes';
import { MOTIVOS } from '@/lib/atendimento/secretaria/motor';
import { MODOS, modoEfetivo, ROTULOS_MODO, type ModoAnne } from '@/lib/atendimento/secretaria/modos';
import { origemMensagem, ROTULOS_ORIGEM } from '@/lib/atendimento/secretaria/origem';
import { controlarAutomacaoAnne, definirModoAnne, delegarReagendamentoAnne, registrarSituacaoConsultaAnne } from '@/lib/atendimento/secretaria/secretaria.functions';
import { situacaoConsulta, type SituacaoConsulta } from '@/lib/atendimento/situacao-consulta';
import { enviarChecklistTrabalhistaAnne } from '@/lib/atendimento/checklist-trabalhista.functions';
import { executar } from '@/lib/executar';

const ROTULO_SITUACAO: Record<SituacaoConsulta, string> = { sem_consulta: 'sem consulta', agendada: 'agendada', confirmada: 'presença confirmada', realizada: 'realizada', ausente: 'cliente faltou', cancelada: 'cancelada' };

/**
 * Interface da secretaria digital no Atendimento (só aparece com a flag ligada):
 * seletor e indicador do modo no cabeçalho, painel de automações ativas com controles, histórico de decisões
 * da Anne com o motivo de cada bloqueio e rótulo interno da origem das mensagens.
 */

const ICONE: Record<ModoAnne, typeof Bot> = { automatico: Bot, hibrido: Users, humano: UserRound, bloqueado: Ban };
const TOM: Record<ModoAnne, string> = {
  automatico: 'border-primary/30 bg-primary/10 text-primary',
  hibrido: 'border-accent bg-accent text-accent-foreground',
  humano: 'border-border bg-muted text-foreground',
  bloqueado: 'border-destructive/30 bg-destructive/10 text-destructive',
};

/** Seletor do modo da Anne (cabeçalho da conversa). Voltar ao Automático a partir de Humano/Bloqueado pede confirmação. */
export function AnneModoSelector({ c, modoPadrao, disabled, onAlterado }: { c: Conversa; modoPadrao: AIMode; disabled?: boolean; onAlterado: () => void }) {
  const definir = useServerFn(definirModoAnne);
  const calc = modoEfetivo(c, modoPadrao);
  const Icone = ICONE[calc.modo];
  const escolher = (valor: string) => {
    const modo = valor as ModoAnne;
    if (modo === calc.modo) return;
    const voltaAuto = modo === 'automatico' && (calc.modo === 'humano' || calc.modo === 'bloqueado');
    if (voltaAuto && !window.confirm('A Anne voltará a conduzir esta conversa sozinha. Confirmar o modo Automático?')) return;
    void executar('Modo da Anne', () => definir({ data: { conversaId: c.id, modo, ...(voltaAuto ? { confirmarAutomatico: true } : {}) } }), onAlterado);
  };
  return (
    <Select value={calc.modo} disabled={!!disabled} onValueChange={escolher}>
      <SelectTrigger aria-label={`Modo da Anne: ${ROTULOS_MODO[calc.modo].titulo}`} title={`${ROTULOS_MODO[calc.modo].descricao} ${calc.motivo}`} className={`h-8 w-auto gap-1.5 rounded-full border px-2.5 text-xs font-medium ${TOM[calc.modo]}`}>
        <Icone className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODOS.map(m => (
          <SelectItem key={m} value={m} title={ROTULOS_MODO[m].descricao}>{ROTULOS_MODO[m].titulo}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Painel recolhível: automações ativas (pausar, retomar, cancelar), delegação de reagendamento e histórico com motivos. */
export function AnneSecretariaPainel({ c, modoPadrao, disabled, onAlterado }: { c: Conversa; modoPadrao: AIMode; disabled?: boolean; onAlterado: () => void }) {
  const controlar = useServerFn(controlarAutomacaoAnne);
  const delegar = useServerFn(delegarReagendamentoAnne);
  const registrarSit = useServerFn(registrarSituacaoConsultaAnne);
  const checklistT09 = useServerFn(enviarChecklistTrabalhistaAnne);
  const agora = new Date();
  const s = c.agenteAna?.secretaria;
  const ativas = automacoesAtivas(s?.automacoes, agora);
  const acoes = [...(s?.acoes ?? [])].reverse().slice(0, 8);
  const modo = modoEfetivo(c, modoPadrao).modo;
  const reserva = c.agenteAna?.reservaCalendar;
  const podeDelegar = modo === 'hibrido' && !!reserva && reserva.inicio === c.consultaAgendada && Date.parse(reserva.inicio) > agora.getTime() && !ativas.length;
  const situacao = situacaoConsulta(c);
  const podeRegistrar = (situacao.estado === 'agendada' || situacao.estado === 'confirmada') && !!situacao.inicio && Date.parse(situacao.inicio) <= agora.getTime();
  const mostraSituacao = situacao.estado !== 'sem_consulta' && (!!c.consultaAgendada || situacao.estado !== 'cancelada');
  const t09 = c.agenteAna?.checklistTrabalhista;
  const podeT09 = !t09 && (c.etapa === 'documentos' || c.contrato === 'assinado');
  if (!ativas.length && !acoes.length && !podeDelegar && !mostraSituacao && !podeT09 && !t09) return null;
  const enviarT09 = () => {
    if (!window.confirm('Confirma que este caso é TRABALHISTA e autoriza enviar agora o checklist oficial (T09) ao cliente? Os itens entram no checklist.')) return;
    void executar('Checklist trabalhista (T09)', () => checklistT09({ data: { conversaId: c.id, confirmarTrabalhista: true } }), onAlterado);
  };
  const acao = (automacaoId: string, controle: 'pausar' | 'retomar' | 'cancelar', rotulo: string) =>
    void executar(rotulo, () => controlar({ data: { conversaId: c.id, automacaoId, controle } }), onAlterado);
  const registrar = (estado: 'realizada' | 'ausente') => {
    if (estado === 'ausente' && !window.confirm('Registrar que o cliente faltou? A Anne vai oferecer novos horários pelo texto oficial quando o modo permitir.')) return;
    void executar(estado === 'realizada' ? 'Registrar consulta realizada' : 'Registrar ausência', () => registrarSit({ data: { conversaId: c.id, estado } }), onAlterado);
  };
  return (
    <details className="shrink-0 border-b bg-card px-3 py-1.5 text-[13px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-0.5 text-xs text-muted-foreground">
        <Bot className="size-3.5" />
        <span className="font-medium text-foreground">Anne</span>
        <span>· {ativas.length ? `${ativas.length} automaç${ativas.length === 1 ? 'ão ativa' : 'ões ativas'}` : 'sem automação ativa'}</span>
        {mostraSituacao && <span className={podeRegistrar ? 'font-medium text-foreground' : ''}>· consulta {ROTULO_SITUACAO[situacao.estado]}{podeRegistrar ? ' (registrar)' : ''}</span>}
        {acoes[0] && <span className="truncate">· última decisão: {acoes[0].texto}</span>}
      </summary>
      <div className="space-y-2 pb-1.5 pt-1">
        {mostraSituacao && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
            <CalendarCheck className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 break-words">Consulta {situacao.inicio ? `de ${dataHoraCurta(situacao.inicio)} ` : ''}· <span className="font-medium">{ROTULO_SITUACAO[situacao.estado]}</span></p>
            {podeRegistrar && <>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} title="Registra que a consulta aconteceu; lembretes e confirmações desta consulta param." onClick={() => registrar('realizada')}><CalendarCheck className="size-3.5" />Realizada</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} title="Registra a ausência e inicia o reagendamento com horários reais da agenda (Automático/Híbrido)." onClick={() => registrar('ausente')}><CalendarX className="size-3.5" />Cliente faltou</Button>
            </>}
          </div>
        )}
        {ativas.map(a => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
            <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 break-words">
              <span className="font-medium">{ROTULOS_TIPO[a.tipo]}</span> · {ROTULOS_ESTADO[a.estado]} · até {dataHoraCurta(a.expiraEm)}
              {a.iniciadaPor === 'equipe' ? ' · delegada pela equipe' : ''}
            </p>
            {a.estado === 'pausada'
              ? <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => acao(a.id, 'retomar', 'Retomar automação')}><Play className="size-3.5" />Retomar</Button>
              : <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => acao(a.id, 'pausar', 'Pausar automação')}><Pause className="size-3.5" />Pausar</Button>}
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => acao(a.id, 'cancelar', 'Cancelar automação')}><X className="size-3.5" />Cancelar</Button>
          </div>
        ))}
        {podeT09 && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} title="Envia o texto oficial T09 (checklist trabalhista) e inclui os itens no checklist. Só com a sua confirmação de que o caso é trabalhista." onClick={enviarT09}>
            <ClipboardList className="size-3.5" />Enviar checklist trabalhista (T09)
          </Button>
        )}
        {t09 && <p className="text-xs text-muted-foreground">Checklist trabalhista (T09): {t09.enviadoEm ? `enviado em ${dataHoraCurta(t09.enviadoEm)} por autorização de ${t09.autorizadoPor}` : t09.falhouEm ? 'envio sem recibo do WhatsApp — conferir a conversa antes de repetir' : 'em envio'}.</p>}
        {podeDelegar && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} title="A Anne oferece horários livres verificados, pede confirmação e só confirma ao cliente com o recibo da agenda. O restante da conversa continua com a equipe."
            onClick={() => void executar('Anne remarca a consulta', () => delegar({ data: { conversaId: c.id } }), onAlterado)}>
            <CalendarClock className="size-3.5" />Anne remarca a consulta
          </Button>
        )}
        {!!acoes.length && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><History className="size-3.5" />Histórico da Anne</p>
            <ul className="space-y-0.5 text-xs">
              {acoes.map(x => (
                <li key={x.id} className="break-words">
                  <span className="text-muted-foreground">{dataHoraCurta(x.em)} · </span>
                  <span className={x.resultado === 'executada' || x.resultado === 'executar' ? '' : 'font-medium'}>{x.resultado === 'executada' || x.resultado === 'executar' ? 'Feito' : x.resultado === 'adiar' ? 'Adiado' : x.resultado === 'aprovacao' ? 'Aguardando aprovação' : x.resultado === 'falhou' ? 'Falhou' : 'Não feito'}</span>
                  {' · '}{x.texto || MOTIVOS[x.motivo]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

/** Rótulo interno da origem de uma mensagem do escritório (Anne, automação ou equipe). Nunca vai ao cliente. */
export function RotuloOrigem({ m }: { m: Pick<Mensagem, 'de' | 'autor' | 'respostaAnaDe' | 'automacaoKey'> }) {
  if (m.de !== 'escritorio') return null;
  const origem = origemMensagem(m);
  return <span className="rounded-sm bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground">{ROTULOS_ORIGEM[origem]}</span>;
}
