import { createFileRoute } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/treinamento")({
  head: () => ({ meta: [{ title: "Treinamento de IA — Manager ADV" }, { name: "description", content: "Ajuste das respostas e da lista de temas proibidos da IA." }, { property: "og:title", content: "Treinamento de IA — Manager ADV" }, { property: "og:description", content: "Ajuste das respostas e da lista de temas proibidos da IA." }] }),
  component: () => <EmBreve titulo="Treinamento de IA" descricao="Ajuste das respostas e da lista de temas proibidos da IA." />,
});
