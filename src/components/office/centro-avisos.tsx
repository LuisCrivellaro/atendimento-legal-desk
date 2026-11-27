import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Centro de avisos da conversa (NV-01 / AT-14): as faixas que ficavam empilhadas entre o "Próximo passo" e as
 * mensagens entram aqui como filhos, com as mesmas props e na mesma ordem, num bloco recolhível
 * "Precisa de atenção · N". Cada faixa continua decidindo se aparece (a maioria devolve null), então o total vem do
 * que foi de fato desenhado no DOM; sem nenhuma faixa, o bloco não aparece.
 * Recolhido, o conteúdo só fica oculto: as faixas continuam montadas (consultas, diálogos e contagem seguem ativos).
 */
export function CentroAvisos({ children, conta }: {
  children: ReactNode;
  /** Diz se uma faixa desenhada conta como aviso (padrão: todas contam). */
  conta?: (faixa: Element) => boolean;
}) {
  const [aberto, setAberto] = useState(true);
  const [total, setTotal] = useState(0);
  const conteudo = useRef<HTMLDivElement>(null);
  const contaRef = useRef(conta);
  contaRef.current = conta;
  const id = useId();
  const recontar = useCallback(() => {
    const el = conteudo.current;
    if (!el) return;
    let n = 0;
    for (const faixa of Array.from(el.children)) if (!contaRef.current || contaRef.current(faixa)) n++;
    setTotal(n);
  }, []);
  // A cada desenho do bloco (antes da pintura) e quando uma faixa muda sozinha (consulta que chegou, aviso resolvido).
  useLayoutEffect(() => { recontar(); });
  useLayoutEffect(() => {
    const el = conteudo.current;
    if (!el) return;
    const observador = new MutationObserver(recontar);
    observador.observe(el, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [recontar]);
  return (
    <section aria-label="Precisa de atenção" hidden={total === 0} className="shrink-0 bg-card">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto(v => !v)}
        className="flex h-9 w-full items-center gap-2 border-b px-4 text-left text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Bell aria-hidden="true" className="size-3.5 shrink-0 text-pending-foreground" />
        <span className="min-w-0 flex-1 truncate">Precisa de atenção · <span className="tabular-nums">{total}</span></span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', !aberto && '-rotate-90')} />
      </button>
      <div id={id} ref={conteudo} hidden={!aberto} className="max-h-[40vh] overflow-y-auto">{children}</div>
    </section>
  );
}
