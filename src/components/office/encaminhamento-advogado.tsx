import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CheckCheck, UserRoundCheck } from 'lucide-react';
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
  return (
    <section aria-label={`Pendência de ${e.responsavel}`} className="shrink-0 space-y-1 border-b bg-pending px-3 py-2 text-[13px] text-pending-foreground">
      <p className="font-medium">{e.responsavel} · {ROTULO_STATUS_ENCAMINHAMENTO[status]} · desde {dataSP(desde)} {horaSP(desde)}</p>
      <p className="break-words">Solicitação: {resumoSolicitacao(e, c, canal)}</p>
      <p className="text-xs">Processo: {e.processo || 'Não identificado'}{e.aviso.estado === 'incerto' || e.aviso.estado === 'nao_enviado' ? ' · Mensagem fixa ao cliente não confirmada: conferir a conversa.' : ''}</p>
      {status !== 'concluido' && (
        <div className="flex flex-wrap gap-2 pt-1">
          {status === 'aguardando' && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void mudar('em_atendimento')}><UserRoundCheck className="size-3.5" />Em atendimento</Button>}
          {status !== 'respondido' && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void mudar('respondido')} title="Use quando a resposta foi dada fora desta conversa"><Check className="size-3.5" />Respondido</Button>}
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void mudar('concluido')}><CheckCheck className="size-3.5" />Concluir</Button>
        </div>
      )}
    </section>
  );
}
