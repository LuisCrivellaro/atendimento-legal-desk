import { createFileRoute, Link } from "@tanstack/react-router";
import { EmBreve } from "@/components/em-breve";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Assessor de prazos — Manager ADV" }, { name: "description", content: "Painel de prazos e pendências do escritório CS Lawyers." }, { property: "og:title", content: "Assessor de prazos — Manager ADV" }, { property: "og:description", content: "Painel de prazos e pendências do escritório CS Lawyers." }] }),
  component: () => (
    <div>
      <EmBreve titulo="Assessor" descricao="Painel de prazos, pendências e próximos passos de cada caso." />
      <div className="px-8"><Link to="/atendimento" className="text-primary underline">Ir para o Atendimento →</Link></div>
    </div>
  ),
});
