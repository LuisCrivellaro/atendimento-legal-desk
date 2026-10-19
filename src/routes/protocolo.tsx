import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/protocolo")({
  head: () => ({ meta: [{ title: "Protocolo — Manager ADV" }, { name: "description", content: "Autuação no tribunal e vínculo do processo no ProJuris." }, { property: "og:title", content: "Protocolo — Manager ADV" }, { property: "og:description", content: "Autuação no tribunal e vínculo do processo no ProJuris." }] }),
  component: () => <EmBreve titulo="Protocolo" descricao="Autuação no tribunal e vínculo do processo no ProJuris." />,
});
