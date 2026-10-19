import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from '@/components/office/dashboard';

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Assessor de prazos — Manager ADV" }, { name: "description", content: "Painel de prazos e pendências do escritório CS Lawyers." }, { property: "og:title", content: "Assessor de prazos — Manager ADV" }, { property: "og:description", content: "Painel de prazos e pendências do escritório CS Lawyers." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: DashboardPage,
});
