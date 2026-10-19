import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Manager ADV" }, { name: "description", content: "Modo demonstração, integrações e perfis de acesso." }, { property: "og:title", content: "Configurações — Manager ADV" }, { property: "og:description", content: "Modo demonstração, integrações e perfis de acesso." }] }),
  component: () => <EmBreve titulo="Configurações" descricao="Modo demonstração, integrações e perfis de acesso." />,
});
