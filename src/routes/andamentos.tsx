import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/andamentos")({
  head: () => ({ meta: [{ title: "Andamentos — Manager ADV" }, { name: "description", content: "Movimentações e intimações vindas do ProJuris." }, { property: "og:title", content: "Andamentos — Manager ADV" }, { property: "og:description", content: "Movimentações e intimações vindas do ProJuris." }] }),
  component: () => <EmBreve titulo="Andamentos" descricao="Movimentações e intimações vindas do ProJuris." />,
});
