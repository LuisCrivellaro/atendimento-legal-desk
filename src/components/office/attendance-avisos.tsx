import { BellRing, Check, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversa } from '@/lib/mock-data';
import { avisosPendentes } from '@/lib/atendimento/avisos-equipe';

/** Avisos operacionais gravados pelo servidor (confirmação de 40 min, lembretes de coleta…). Nada aqui é enviado sozinho. */
export function AttendanceAvisos({ c, busy, onUseText, onResolve }: { c: Conversa; busy: boolean; onUseText: (texto: string) => void; onResolve: (id: string) => void }) {
  const avisos = avisosPendentes(c);
  if (!avisos.length) return null;
  return (
    <section aria-label="Avisos para a equipe" className="shrink-0 text-xs">
      {/* Cada aviso é uma linha; os de prioridade são críticos e ficam à vista com o centro de avisos recolhido. */}
      {avisos.map(a => (
        <div key={a.id} data-aviso-item="" data-tom="alerta" data-critico={a.prioridade ? '' : undefined} data-resumo={`${a.prioridade ? 'Prioridade · ' : ''}${a.texto}`} className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-1.5 ${a.prioridade ? 'border-pending-border bg-pending text-pending-foreground' : 'bg-card text-foreground'}`}>
          <BellRing aria-hidden="true" className={`size-4 shrink-0 ${a.prioridade ? 'text-warning-700' : 'text-warning-600'}`} />
          <p className="aviso-texto min-w-0 flex-1 break-words font-medium" title={a.texto}>{a.prioridade ? 'Prioridade · ' : ''}{a.texto}</p>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {a.textoPronto && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onUseText(a.textoPronto ?? '')} title="Coloca o texto na caixa de mensagem para revisar e enviar">
                <MessageSquareText />Usar texto pronto
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onResolve(a.id)} title="Marca o aviso como resolvido pela equipe">
              <Check />Resolvido
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
