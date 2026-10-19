import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Manager ADV" }, { name: "description", content: "Fila de auditoria IA e auditoria humana do advogado júnior." }, { property: "og:title", content: "Auditoria — Manager ADV" }, { property: "og:description", content: "Fila de auditoria IA e auditoria humana do advogado júnior." }] }),
  component: () => <EmBreve titulo="Auditoria" descricao="Fila de auditoria IA e auditoria humana do advogado júnior." />,
});
