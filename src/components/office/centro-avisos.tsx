import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tom de um aviso, do mais ao menos importante. */
export type TomAviso = 'erro' | 'alerta' | 'info';
const PESO: Record<TomAviso, number> = { erro: 3, alerta: 2, info: 1 };
const COR_SINO: Record<TomAviso, string> = { erro: 'text-destructive', alerta: 'text-warning-600', info: 'text-primary' };

type Resumo = { total: number; criticos: number; texto: string; tom: TomAviso };
const VAZIO: Resumo = { total: 0, criticos: 0, texto: '', tom: 'info' };

/**
 * Centro de avisos da conversa (NV-01 / AT-14): as faixas que ficavam empilhadas entre o "Próximo passo" e as
 * mensagens entram aqui como filhos, com as mesmas props e na mesma ordem. Cada faixa continua decidindo se aparece
 * (a maioria devolve null), então o total vem do que foi de fato desenhado no DOM; sem nenhuma faixa, o bloco some.
 *
 * Abre recolhido, numa linha: "Precisa de atenção · N" e o aviso mais importante (erro > alerta > info). Clicar
 * expande, com altura máxima e rolagem própria. Avisos críticos nunca ficam escondidos: a faixa (ou a linha, em
 * faixas com vários itens) marcada com `data-critico` continua à vista, compacta, mesmo recolhido.
 *
 * Marcação usada pelas faixas: `data-tom` (erro | alerta | info), `data-resumo` (texto curto para a linha de resumo),
 * `data-critico`, `data-aviso-item` (cada aviso de uma faixa com vários) e `data-aviso-detalhe` (só aparece expandido).
 * Recolhido, o conteúdo só fica oculto: as faixas continuam montadas (consultas, diálogos e contagem seguem ativos).
 */
export function CentroAvisos({ children, conta }: {
  children: ReactNode;
  /** Diz se uma faixa desenhada conta como aviso (padrão: todas contam). */
  conta?: (faixa: Element) => boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [resumo, setResumo] = useState<Resumo>(VAZIO);
  const conteudo = useRef<HTMLDivElement>(null);
  const contaRef = useRef(conta);
  contaRef.current = conta;
  const id = useId();
  const recontar = useCallback(() => {
    const el = conteudo.current;
    if (!el) return;
    let total = 0;
    let criticos = 0;
    let melhor: { peso: number; texto: string; tom: TomAviso } | null = null;
    for (const faixa of Array.from(el.children)) {
      if (contaRef.current && !contaRef.current(faixa)) continue;
      const itens = Array.from(faixa.querySelectorAll('[data-aviso-item]'));
      for (const item of itens.length ? itens : [faixa]) {
        total++;
        // Críticos já ficam à vista; a linha de resumo apresenta o mais importante entre os que o recolhimento esconde.
        if (item.hasAttribute('data-critico')) { criticos++; continue; }
        const tom = (item.getAttribute('data-tom') ?? faixa.getAttribute('data-tom') ?? 'alerta') as TomAviso;
        const peso = PESO[tom] ?? PESO.alerta;
        const texto = item.getAttribute('data-resumo') ?? faixa.getAttribute('data-resumo') ?? faixa.getAttribute('aria-label') ?? '';
        if (!melhor || peso > melhor.peso) melhor = { peso, texto, tom };
      }
    }
    const novo: Resumo = { total, criticos, texto: melhor?.texto ?? '', tom: melhor?.tom ?? 'info' };
    setResumo(r => (r.total === novo.total && r.criticos === novo.criticos && r.texto === novo.texto && r.tom === novo.tom ? r : novo));
  }, []);
  // A cada desenho do bloco (antes da pintura) e quando uma faixa muda sozinha (consulta que chegou, aviso resolvido).
  useLayoutEffect(() => { recontar(); });
  useLayoutEffect(() => {
    const el = conteudo.current;
    if (!el) return;
    const observador = new MutationObserver(recontar);
    observador.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-critico', 'data-tom', 'data-resumo'] });
    return () => observador.disconnect();
  }, [recontar]);
  const { total, criticos, texto, tom } = resumo;
  const ocultos = total - criticos;
  return (
    <section aria-label="Precisa de atenção" hidden={total === 0} className="shrink-0 border-b bg-card">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto(v => !v)}
        className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs transition-colors duration-150 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Bell aria-hidden="true" className={cn('size-4 shrink-0', COR_SINO[ocultos ? tom : 'alerta'])} />
        <span className="shrink-0 font-semibold text-foreground">Precisa de atenção · <span className="tabular-nums">{total}</span></span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{!aberto && ocultos > 0 && texto ? texto : ''}</span>
        <span className="shrink-0 text-2xs font-medium text-primary">{aberto ? 'Recolher' : ocultos > 0 ? `Ver ${ocultos === 1 ? 'aviso' : `${ocultos} avisos`}` : 'Detalhes'}</span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', aberto && 'rotate-180')} />
      </button>
      <div id={id} ref={conteudo} data-recolhido={aberto ? undefined : ''} className={cn('centro-avisos-lista overflow-y-auto overscroll-contain', aberto ? 'max-h-[36vh]' : 'max-h-[24vh]')}>{children}</div>
    </section>
  );
}
