import { cn } from "@/lib/utils";

/**
 * Esqueletos de carregamento no formato do conteúdo que vai chegar (docs/research/MOTION_GUIDELINES.md).
 * O texto para leitor de tela fica no contêiner; os blocos são decorativos.
 */
function Bloco({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton-brilho", className)} />;
}

/** Lista de itens com avatar e duas linhas (conversas, clientes). */
export function SkeletonLista({ itens = 6, rotulo = "Carregando…", className }: { itens?: number; rotulo?: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("divide-y", className)}>
      <span className="sr-only">{rotulo}</span>
      {Array.from({ length: itens }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Bloco className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bloco className="h-3.5 w-2/3" />
            <Bloco className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Página de trabalho: título, faixa de indicadores e dois blocos de conteúdo. */
export function SkeletonPagina({ rotulo = "Carregando…", indicadores = 4, className }: { rotulo?: string; indicadores?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-5", className)}>
      <span className="sr-only">{rotulo}</span>
      <Bloco className="h-9 w-56" />
      {/* Mesmo formato da faixa de indicadores das telas, para nada pular quando os dados chegam. */}
      <div className="faixa-indicadores">
        {Array.from({ length: indicadores }, (_, i) => (
          <div key={i} className="indicador gap-2">
            <Bloco className="h-6 w-12" />
            <Bloco className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Bloco className="h-48" />
        <Bloco className="h-48" />
      </div>
    </div>
  );
}

/** Linhas de tabela. */
export function SkeletonTabela({ linhas = 5, rotulo = "Carregando…", className }: { linhas?: number; rotulo?: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-2", className)}>
      <span className="sr-only">{rotulo}</span>
      <Bloco className="h-9" />
      {Array.from({ length: linhas }, (_, i) => (
        <Bloco key={i} className="h-9" />
      ))}
    </div>
  );
}
