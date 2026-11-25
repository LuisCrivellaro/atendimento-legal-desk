import { Check, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversa } from '@/lib/mock-data';
import { avisosPendentes } from '@/lib/atendimento/avisos-equipe';

/** Avisos operacionais gravados pelo servidor (confirmação de 40 min, lembretes de coleta…). Nada aqui é enviado sozinho. */
export function AttendanceAvisos({ c, busy, onUseText, onResolve }: { c: Conversa; busy: boolean; onUseText: (texto: string) => void; onResolve: (id: string) => void }) {
  const avisos = avisosPendentes(c);
  if (!avisos.length) return null;
  return (
    <section aria-label="Avisos para a equipe" className="shrink-0 space-y-1 border-b bg-pending px-3 py-2 text-[13px] text-pending-foreground">
      {avisos.map(a => (
        <div key={a.id} className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 break-words font-medium">{a.prioridade ? 'Prioridade · ' : ''}{a.texto}</p>
          {a.textoPronto && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={() => onUseText(a.textoPronto ?? '')} title="Coloca o texto na caixa de mensagem para revisar e enviar">
              <MessageSquareText className="size-3.5" />Usar texto pronto
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={() => onResolve(a.id)} title="Marca o aviso como resolvido pela equipe">
            <Check className="size-3.5" />Resolvido
          </Button>
        </div>
      ))}
    </section>
  );
}
