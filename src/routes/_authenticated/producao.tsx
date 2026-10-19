import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_authenticated/producao")({
  head: () => ({ meta: [{ title: "Produção — Manager ADV" }, { name: "description", content: "Kanban de casos, checklist de provas e editor de petições com IA." }, { property: "og:title", content: "Produção — Manager ADV" }, { property: "og:description", content: "Kanban de casos, checklist de provas e editor de petições com IA." }] }),
  component: () => <EmBreve titulo="Produção" descricao="Kanban de casos, checklist de provas e editor de petições com IA." />,
});
