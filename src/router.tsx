import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Transição suave só quando a tela muda (não ao trocar de conversa, filtro ou aba na mesma tela).
    // Transição só ao trocar de tela com o app já aberto e visível. No primeiro carregamento (sem tela anterior) e em
    // aba em segundo plano, a troca é direta: o carregamento nunca fica esperando uma animação que não vai acontecer.
    defaultViewTransition: {
      types: ({ fromLocation, pathChanged }) =>
        fromLocation && pathChanged && document.visibilityState === "visible" ? ["troca-de-tela"] : false,
    },
  });

  return router;
};
