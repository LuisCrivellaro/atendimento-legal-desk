import { PIPELINE } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

/**
 * NV-02: o fio das 10 etapas do caso (docs/research/CREATIVE_DIRECTION.md, DESIGN_SYSTEM.md "Fio das etapas").
 * Só mostra a etapa já gravada no caso; não avança nada. Quando a etapa gravada muda com a tela aberta, o trecho
 * preenchido cresce até o novo nó (transform scaleX, --motion-focal, --ease-out). Com movimento reduzido, a regra
 * global de styles.css deixa a troca instantânea. Quem usa deve passar `key` com o id do caso para que trocar de caso
 * não pareça um avanço. O rótulo usa a cor do texto: --brand-strong sobre --background fica em 4,46:1, abaixo de 4,5:1
 * para texto de 12px. O contorno das etapas futuras usa --input (3:1), porque --border some sobre o fundo.
 */
export function FioEtapas({ etapa, className }: { etapa: number; className?: string }) {
  const total = PIPELINE.length;
  const atual = Number.isFinite(etapa) ? Math.min(Math.max(Math.trunc(etapa), 0), total - 1) : 0;
  // A linha vai do centro do primeiro nó ao centro do último (colunas de largura igual).
  const borda = `${50 / total}%`;
  return (
    <div className={cn('relative min-w-0', className)}>
      <span aria-hidden="true" className="pointer-events-none absolute top-[7px] h-0.5 bg-border" style={{ left: borda, right: borda }} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[7px] h-0.5 origin-left bg-brand-strong transition-transform duration-[var(--motion-focal)] ease-[var(--ease-out)]"
        style={{ left: borda, right: borda, transform: `scaleX(${atual / (total - 1)})` }}
      />
      <ol aria-label="Etapas do caso" className="relative flex pb-6">
        {PIPELINE.map((rotulo, i) => {
          const estado = i < atual ? 'concluída' : i === atual ? 'atual' : 'a fazer';
          return (
            <li
              key={rotulo}
              aria-current={i === atual ? 'step' : undefined}
              title={i === atual ? undefined : `${i + 1}. ${rotulo} (${estado})`}
              className="relative flex h-4 min-w-0 flex-1 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'relative block shrink-0 rounded-full',
                  i < atual && 'size-2.5 bg-brand-strong',
                  i === atual && 'size-3 bg-brand-strong ring-2 ring-brand-strong ring-offset-2 ring-offset-background',
                  i > atual && 'size-2.5 border-2 border-input bg-card',
                )}
              />
              <span className="sr-only">{i === atual ? `${rotulo} · etapa ${i + 1} de ${total}` : `${i + 1}. ${rotulo} (${estado})`}</span>
            </li>
          );
        })}
      </ol>
      {/* Rótulo da etapa atual: ancorado no nó e deslocado na proporção da posição (0% no primeiro, 100% no último),
          para nunca sair da largura do fio em telas estreitas. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[22px] whitespace-nowrap text-xs font-semibold text-foreground transition-[left,transform] duration-[var(--motion-focal)] ease-[var(--ease-out)]"
        style={{ left: `${((atual + 0.5) / total) * 100}%`, transform: `translateX(-${(atual / (total - 1)) * 100}%)` }}
      >
        {PIPELINE[atual]}
        <span className="font-normal text-muted-foreground"> · etapa {atual + 1} de {total}</span>
      </span>
    </div>
  );
}
