import { useServerFn } from '@tanstack/react-start';
import { Ban, Bot, CalendarCheck, CalendarClock, CalendarX, ChevronDown, ClipboardList, FileText, History, Pause, Play, UserRound, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmar } from '@/components/confirmar';
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
import { anexarRegistroConsultaAnne } from '@/lib/atendimento/registro-consulta.functions';
import { requisitosProducao } from '@/lib/atendimento/trato-feito';
import { executar } from '@/lib/executar';

const ROTULO_SITUACAO: Record<SituacaoConsulta, string> = { sem_consulta: 'sem consulta', agendada: 'agendada', confirmada: 'presença confirmada', realizada: 'realizada', ausente: 'cliente faltou', cancelada: 'cancelada' };

/**
 * Interface da secretaria digital no Atendimento (só aparece com a flag ligada):
 * seletor e indicador do modo no cabeçalho, painel de automações ativas com controles, histórico de decisões
 * da Anne com o motivo de cada bloqueio e rótulo interno da origem das mensagens.
 */

const ICONE: Record<ModoAnne, typeof Bot> = { automatico: Bot, hibrido: Users, humano: UserRound, bloqueado: Ban };
const TOM: Record<ModoAnne, string> = {
  automatico: 'border-info-border bg-info-soft text-info-soft-foreground',
  hibrido: 'border-turquoise-200 bg-card text-foreground',
  humano: 'border-border-strong bg-muted text-foreground',
  bloqueado: 'border-destructive-border bg-destructive-soft text-destructive-soft-foreground',
};

/** Seletor do modo da Anne (cabeçalho da conversa). Voltar ao Automático a partir de Humano/Bloqueado pede confirmação. */
export function AnneModoSelector({ c, modoPadrao, disabled, onAlterado }: { c: Conversa; modoPadrao: AIMode; disabled?: boolean; onAlterado: () => void }) {
  const definir = useServerFn(definirModoAnne);
  const calc = modoEfetivo(c, modoPadrao);
  const Icone = ICONE[calc.modo];
  const escolher = async (valor: string) => {
    const modo = valor as ModoAnne;
    if (modo === calc.modo) return;
    const voltaAuto = modo === 'automatico' && (calc.modo === 'humano' || calc.modo === 'bloqueado');
    if (voltaAuto && !(await confirmar({ titulo: 'Voltar ao modo Automático?', descricao: 'A Anne voltará a conduzir esta conversa sozinha.', confirmar: 'Voltar ao Automático' }))) return;
    void executar('Modo da Anne', () => definir({ data: { conversaId: c.id, modo, ...(voltaAuto ? { confirmarAutomatico: true } : {}) } }), onAlterado);
  };
  return (
    <Select value={calc.modo} disabled={!!disabled} onValueChange={escolher}>
      <SelectTrigger aria-label={`Modo da Anne: ${ROTULOS_MODO[calc.modo].titulo}`} title={`${ROTULOS_MODO[calc.modo].descricao} ${calc.motivo}`} className={`h-8 w-auto gap-1.5 rounded-md border px-2 text-xs font-medium shadow-none ${TOM[calc.modo]}`}>
        <Icone className="size-4 shrink-0" />
        <span className="attendance-modo-texto"><SelectValue /></span>
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
  const anexarRegistro = useServerFn(anexarRegistroConsultaAnne);
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
  const realizada = situacao.estado === 'realizada';
  const arquivosConsulta = c.consulta?.arquivos ?? [];
  const producao = c.contrato === 'assinado' || c.etapa === 'documentos' ? requisitosProducao(c) : undefined;
  const anexar = (tipo: 'transcricao' | 'resumo') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.pdf,.docx,.odt,text/plain,text/markdown,application/pdf';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      void executar(tipo === 'transcricao' ? 'Anexar transcrição' : 'Anexar resumo', async () => {
        if (f.size > 10 * 1024 * 1024) throw new Error('Arquivo acima de 10 MB.');
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const mime = f.type || (f.name.endsWith('.md') ? 'text/markdown' : f.name.endsWith('.txt') ? 'text/plain' : '');
        return anexarRegistro({ data: { conversaId: c.id, tipo, nome: f.name, mime, base64: btoa(bin) } });
      }, onAlterado);
    };
    input.click();
  };
  const t09 = c.agenteAna?.checklistTrabalhista;
  const podeT09 = !t09 && (c.etapa === 'documentos' || c.contrato === 'assinado');
  if (!ativas.length && !acoes.length && !podeDelegar && !mostraSituacao && !podeT09 && !t09 && !producao && !arquivosConsulta.length) return null;
  const enviarT09 = async () => {
    if (!(await confirmar({ titulo: 'Enviar o checklist trabalhista (T09)?', descricao: 'Confirme que este caso é TRABALHISTA. O checklist oficial (T09) será enviado agora ao cliente e os itens entram no checklist do caso.', confirmar: 'Enviar checklist T09' }))) return;
    void executar('Checklist trabalhista (T09)', () => checklistT09({ data: { conversaId: c.id, confirmarTrabalhista: true } }), onAlterado);
  };
  const acao = (automacaoId: string, controle: 'pausar' | 'retomar' | 'cancelar', rotulo: string) =>
    void executar(rotulo, () => controlar({ data: { conversaId: c.id, automacaoId, controle } }), onAlterado);
  const registrar = async (estado: 'realizada' | 'ausente') => {
    if (estado === 'ausente' && !(await confirmar({ titulo: 'Registrar que o cliente faltou?', descricao: 'A Anne vai oferecer novos horários pelo texto oficial quando o modo permitir.', confirmar: 'Registrar ausência' }))) return;
    void executar(estado === 'realizada' ? 'Registrar consulta realizada' : 'Registrar ausência', () => registrarSit({ data: { conversaId: c.id, estado } }), onAlterado);
  };
  // Centro de avisos: falha de envio do T09 é crítica (fica à vista recolhido); consulta passada sem registro é alerta.
  const t09Falhou = !!t09 && !t09.enviadoEm && !!t09.falhouEm;
  const tom = t09Falhou ? 'erro' : podeRegistrar ? 'alerta' : 'info';
  const resumo = `Anne · ${ativas.length ? `${ativas.length} automaç${ativas.length === 1 ? 'ão ativa' : 'ões ativas'}` : 'sem automação ativa'}${mostraSituacao ? ` · consulta ${ROTULO_SITUACAO[situacao.estado]}${podeRegistrar ? ' (registrar)' : ''}` : ''}`;
  return (
    <details open data-tom={tom} data-critico={t09Falhou ? '' : undefined} data-resumo={resumo} className={`group/anne shrink-0 border-t text-xs ${t09Falhou ? 'border-destructive-border bg-destructive-soft' : 'bg-card'}`}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-muted-foreground transition-colors duration-150 hover:bg-surface-subtle [&::-webkit-details-marker]:hidden">
        <Bot className="size-4 shrink-0 text-primary" />
        <span className="aviso-texto min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">Anne</span>
          <span> · {ativas.length ? `${ativas.length} automaç${ativas.length === 1 ? 'ão ativa' : 'ões ativas'}` : 'sem automação ativa'}</span>
          {mostraSituacao && <span className={podeRegistrar ? 'font-medium text-foreground' : ''}> · consulta {ROTULO_SITUACAO[situacao.estado]}{podeRegistrar ? ' (registrar)' : ''}</span>}
          {t09Falhou && <span className="font-medium text-destructive-soft-foreground"> · checklist T09 sem recibo do WhatsApp</span>}
          {acoes[0] && <span> · última decisão: {acoes[0].texto}</span>}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 group-open/anne:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div data-aviso-detalhe="" className="divide-y divide-graphite-100 px-3 pb-2">
        {mostraSituacao && (
          <div className="flex flex-wrap items-center gap-2 py-1.5">
            <CalendarCheck className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 break-words">Consulta {situacao.inicio ? `de ${dataHoraCurta(situacao.inicio)} ` : ''}· <span className="font-medium">{ROTULO_SITUACAO[situacao.estado]}</span></p>
            {podeRegistrar && <>
              <Button size="sm" variant="outline" disabled={disabled} title="Registra que a consulta aconteceu; lembretes e confirmações desta consulta param." onClick={() => registrar('realizada')}><CalendarCheck />Realizada</Button>
              <Button size="sm" variant="outline" disabled={disabled} title="Registra a ausência e inicia o reagendamento com horários reais da agenda (Automático/Híbrido)." onClick={() => registrar('ausente')}><CalendarX />Cliente faltou</Button>
            </>}
          </div>
        )}
        {ativas.map(a => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 py-1.5">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 break-words">
              <span className="font-medium">{ROTULOS_TIPO[a.tipo]}</span> · {ROTULOS_ESTADO[a.estado]} · até {dataHoraCurta(a.expiraEm)}
              {a.iniciadaPor === 'equipe' ? ' · delegada pela equipe' : ''}
            </p>
            {a.estado === 'pausada'
              ? <Button size="sm" variant="outline" disabled={disabled} onClick={() => acao(a.id, 'retomar', 'Retomar automação')}><Play />Retomar</Button>
              : <Button size="sm" variant="outline" disabled={disabled} onClick={() => acao(a.id, 'pausar', 'Pausar automação')}><Pause />Pausar</Button>}
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => acao(a.id, 'cancelar', 'Cancelar automação')}><X />Cancelar</Button>
          </div>
        ))}
        {(realizada || arquivosConsulta.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 py-1.5">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 break-words">
              Registro da consulta: {arquivosConsulta.length ? arquivosConsulta.map(a => `${a.tipo === 'transcricao' ? 'transcrição' : 'resumo'} (${a.driveUrl ? 'no Drive' : a.pendenciaDrive ?? 'guardado'})`).join(' · ') : 'sem transcrição/resumo anexados'}
            </p>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => anexar('transcricao')}>Anexar transcrição</Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => anexar('resumo')}>Anexar resumo</Button>
          </div>
        )}
        {producao && (
          <p className={`py-1.5 ${producao.pronto ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
            {producao.pronto ? 'Pronto para a Produção: a Dra. inicia pelo botão Produção.' : `Para a Produção falta: ${producao.itens.filter(i => !i.ok).map(i => i.nome.toLowerCase()).join(', ')}.`}
          </p>
        )}
        {(podeT09 || podeDelegar) && (
          <div className="flex flex-wrap items-center gap-2 py-1.5">
            {podeT09 && (
              <Button size="sm" variant="outline" disabled={disabled} title="Envia o texto oficial T09 (checklist trabalhista) e inclui os itens no checklist. Só com a sua confirmação de que o caso é trabalhista." onClick={enviarT09}>
                <ClipboardList />Enviar checklist trabalhista (T09)
              </Button>
            )}
            {podeDelegar && (
              <Button size="sm" variant="outline" disabled={disabled} title="A Anne oferece horários livres verificados, pede confirmação e só confirma ao cliente com o recibo da agenda. O restante da conversa continua com a equipe."
                onClick={() => void executar('Anne remarca a consulta', () => delegar({ data: { conversaId: c.id } }), onAlterado)}>
                <CalendarClock />Anne remarca a consulta
              </Button>
            )}
          </div>
        )}
        {t09 && <p className={`py-1.5 ${t09Falhou ? 'font-medium text-destructive-soft-foreground' : 'text-muted-foreground'}`}>Checklist trabalhista (T09): {t09.enviadoEm ? `enviado em ${dataHoraCurta(t09.enviadoEm)} por autorização de ${t09.autorizadoPor}` : t09.falhouEm ? 'envio sem recibo do WhatsApp — conferir a conversa antes de repetir' : 'em envio'}.</p>}
        {!!acoes.length && (
          <div className="py-1.5">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground"><History className="size-3.5" />Histórico da Anne</p>
            <ul className="space-y-0.5">
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
  return <span className="rounded-sm bg-muted px-1 align-[1px] text-2xs font-medium text-graphite-700">{ROTULOS_ORIGEM[origem]}</span>;
}
