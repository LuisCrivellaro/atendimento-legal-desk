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
    defaultViewTransition: { types: ({ pathChanged }) => (pathChanged ? ["troca-de-tela"] : false) },
  });

  return router;
};
