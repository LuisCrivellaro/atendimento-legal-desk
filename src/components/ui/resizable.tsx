import * as React from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof Group>) => (
  <Group
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
);

/**
 * Alça para ajustar a largura de uma coluna em layout de grade (Atendimento: lista de conversas e painel do cliente).
 * Fica na borda do `alvo` (posicione o pai com `relative`). Acessível: role="separator" com a largura atual, setas
 * (Shift = passo maior), Home/End e Enter ou duplo clique para voltar ao padrão. `onMudar(null)` = padrão;
 * `final` indica o fim do gesto (hora de guardar a escolha).
 */
function AlcaLargura({
  alvo,
  lado,
  min,
  max,
  onMudar,
  className,
  ...aria
}: {
  alvo: React.RefObject<HTMLElement | null>;
  /** Lado do alvo em que a alça fica: "direita" (arrastar para a direita alarga) ou "esquerda" (o contrário). */
  lado: "direita" | "esquerda";
  min: number;
  max: number;
  onMudar: (largura: number | null, final: boolean) => void;
  className?: string;
  "aria-label": string;
  "aria-controls"?: string;
}) {
  const [largura, setLargura] = React.useState<number>();
  const [arrastando, setArrastando] = React.useState(false);
  const gesto = React.useRef<{ x: number; largura: number; ultimo: number } | null>(null);
  const sinal = lado === "direita" ? 1 : -1;
  const atual = () => Math.round(alvo.current?.getBoundingClientRect().width ?? largura ?? min);
  const limitar = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
  // Largura atual para o leitor de tela (aria-valuenow). O ref do alvo pode chegar depois do efeito (modo estrito
  // religa refs e efeitos): tenta de novo no quadro seguinte.
  const [tentativa, setTentativa] = React.useState(0);
  React.useEffect(() => {
    const el = alvo.current;
    if (typeof ResizeObserver === "undefined") return;
    if (!el) {
      if (tentativa > 10) return;
      const quadro = requestAnimationFrame(() => setTentativa((t) => t + 1));
      return () => cancelAnimationFrame(quadro);
    }
    const medir = () => setLargura(Math.round(el.getBoundingClientRect().width));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [alvo, tentativa]);
  // Aplica e confere a largura que a grade realmente aceitou (sem "zona morta" quando falta espaço na tela).
  const aplicar = (v: number, final: boolean) => {
    onMudar(v, false);
    const real = atual();
    const efetivo = real < v - 1 ? real : v;
    if (efetivo !== v || final) onMudar(efetivo, final);
    if (gesto.current) gesto.current.ultimo = efetivo;
    setLargura(real);
  };
  const soltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g) return;
    gesto.current = null;
    setArrastando(false);
    document.body.style.removeProperty("cursor");
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onMudar(g.ultimo, true);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={largura}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Arraste para ajustar a largura (duplo clique volta ao padrão)"
      data-arrastando={arrastando || undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const inicio = atual();
        gesto.current = { x: e.clientX, largura: inicio, ultimo: inicio };
        document.body.style.cursor = "col-resize";
        setArrastando(true);
      }}
      onPointerMove={(e) => {
        const g = gesto.current;
        if (g) aplicar(limitar(g.largura + sinal * (e.clientX - g.x)), false);
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onDoubleClick={() => onMudar(null, true)}
      onKeyDown={(e) => {
        const passo = e.shiftKey ? 64 : 16;
        let v: number;
        if (e.key === "ArrowLeft") v = atual() - sinal * passo;
        else if (e.key === "ArrowRight") v = atual() + sinal * passo;
        else if (e.key === "Home") v = min;
        else if (e.key === "End") v = max;
        else if (e.key === "Enter") {
          e.preventDefault();
          onMudar(null, true);
          return;
        } else return;
        e.preventDefault();
        aplicar(limitar(v), true);
      }}
      className={cn(
        "group absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none select-none outline-none",
        lado === "direita" ? "-right-[3px]" : "-left-[3px]",
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors duration-150 group-hover:bg-turquoise-300 group-focus-visible:bg-primary group-data-[arrastando]:bg-primary"
      />
    </div>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, AlcaLargura };
