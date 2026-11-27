import { useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export type OpcoesConfirmacao = {
  /** Pergunta com a consequência ("Registrar que o cliente faltou?"). */
  titulo: string;
  /** O que acontece se confirmar. */
  descricao?: string;
  /** Rótulo do botão que confirma: a ação em si ("Registrar ausência"), nunca "OK". */
  confirmar: string;
  cancelar?: string;
  /** Ação destrutiva ou difícil de desfazer: botão de confirmação em vermelho. */
  perigo?: boolean;
};

type Pedido = OpcoesConfirmacao & { responder: (ok: boolean) => void };

let atual: Pedido | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());

/**
 * Confirmação no padrão do MANAGER ADV, no lugar de `window.confirm`.
 * Resolve `true` só quando a pessoa clica no botão de confirmar; fechar, Esc ou "Voltar" resolvem `false`.
 * Um pedido novo cancela (false) o anterior que ainda estiver aberto.
 */
export function confirmar(opcoes: OpcoesConfirmacao): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  atual?.responder(false);
  return new Promise<boolean>((resolve) => {
    atual = { ...opcoes, responder: resolve };
    avisar();
  });
}

function responder(ok: boolean) {
  const pedido = atual;
  if (!pedido) return;
  atual = null;
  avisar();
  pedido.responder(ok);
}

const assinar = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
};

/** Montado uma vez na raiz do app. */
export function ConfirmacaoHost() {
  const pedido = useSyncExternalStore(assinar, () => atual, () => null);
  return (
    <AlertDialog
      open={!!pedido}
      onOpenChange={(aberto) => {
        if (!aberto) responder(false);
      }}
    >
      <AlertDialogContent {...(pedido?.descricao ? {} : { "aria-describedby": undefined })}>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.descricao && <AlertDialogDescription>{pedido.descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>
            {pedido?.cancelar ?? "Voltar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={pedido?.perigo ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={() => responder(true)}
          >
            {pedido?.confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
