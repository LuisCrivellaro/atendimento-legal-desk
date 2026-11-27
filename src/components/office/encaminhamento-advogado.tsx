import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CheckCheck, UserRound, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversa } from '@/lib/mock-data';
import { encaminhamentoAberto, resumoSolicitacao, ROTULO_STATUS_ENCAMINHAMENTO, statusEncaminhamento, dataSP, horaSP } from '@/lib/atendimento/encaminhamento-advogado';
import { marcarEncaminhamentoAdvogado } from '@/lib/atendimento/encaminhamento.functions';
import { recarregarConversa } from '@/lib/atendimento/cache-casos';

/**
 * Pendência do advogado responsável (Fernando) nesta conversa: situação derivada das mensagens reais (resposta
 * efetiva da equipe tira da fila; saudação não basta) e ações da equipe. Nada aqui envia mensagem ao cliente.
 */
export function EncaminhamentoAdvogado({ c }: { c: Conversa }) {
  const marcar = useServerFn(marcarEncaminhamentoAdvogado);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const canal = c.mensagens.some(m => m.canal === 'ultramsg') || !c.mensagens.some(m => m.canal === 'telegram') ? 'ultramsg' : 'telegram';
  const e = encaminhamentoAberto(c, canal);
  if (!e) return null;
  const status = statusEncaminhamento(e, c, canal);
  const mudar = async (novo: 'em_atendimento' | 'respondido' | 'concluido') => {
    setBusy(true);
    try {
      await marcar({ data: { conversaId: c.id, encaminhamentoId: e.id, status: novo } });
      await recarregarConversa(qc, c.id);
      toast.success(`Pendência: ${ROTULO_STATUS_ENCAMINHAMENTO[novo].toLowerCase()}.`);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível atualizar a pendência.');
    } finally { setBusy(false); }
  };
  const desde = new Date(e.criadoEm);
  const titulo = `${e.responsavel} · ${ROTULO_STATUS_ENCAMINHAMENTO[status]} · desde ${dataSP(desde)} ${horaSP(desde)}`;
  // Mensagem fixa ao cliente sem confirmação do canal = falha de envio: aviso crítico, fica à vista com o centro recolhido.
  const naoConfirmada = e.aviso.estado === 'incerto' || e.aviso.estado === 'nao_enviado';
  return (
    <section aria-label={`Pendência de ${e.responsavel}`} data-tom={naoConfirmada ? 'erro' : 'alerta'} data-critico={naoConfirmada ? '' : undefined} data-resumo={titulo} className={`shrink-0 border-t px-3 py-1.5 text-xs ${naoConfirmada ? 'border-destructive-border bg-destructive-soft text-destructive-soft-foreground' : 'bg-card text-foreground'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <UserRound aria-hidden="true" className={`size-4 shrink-0 ${naoConfirmada ? 'text-destructive' : 'text-warning-600'}`} />
        <p className="aviso-texto min-w-0 flex-1 font-medium" title={titulo}>{titulo}</p>
        {status !== 'concluido' && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {status === 'aguardando' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void mudar('em_atendimento')}><UserRoundCheck />Em atendimento</Button>}
            {status !== 'respondido' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void mudar('respondido')} title="Use quando a resposta foi dada fora desta conversa"><Check />Respondido</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void mudar('concluido')}><CheckCheck />Concluir</Button>
          </div>
        )}
      </div>
      {naoConfirmada && <p className="aviso-texto pl-6 font-medium">Mensagem fixa ao cliente não confirmada: conferir a conversa.</p>}
      <div data-aviso-detalhe="" className={`space-y-0.5 pl-6 ${naoConfirmada ? '' : 'text-muted-foreground'}`}>
        <p className="break-words">Solicitação: {resumoSolicitacao(e, c, canal)}</p>
        <p>Processo: {e.processo || 'Não identificado'}</p>
      </div>
    </section>
  );
}
