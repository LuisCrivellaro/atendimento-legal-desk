import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { QuickSearch } from '@/components/quick-search';

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: Layout,
});

const roleLabel: Record<string, string> = {
  advogada_senior: "Advogada Sênior", advogado_junior: "Advogado Júnior", atendente: "Atendente/Assessora", operacoes: "Operações", admin: "Administrador",
};

function Layout() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const { data: perfil } = useQuery({
    queryKey: ["perfil", user.id],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return { nome: p.data?.nome ?? user.email ?? "", roles: (r.data ?? []).map((x) => roleLabel[x.role] ?? x.role) };
    },
  });

  const sair = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };

  return (
    <SidebarProvider>
      <header className="fixed inset-x-0 top-0 z-30 h-16 border-b-2 border-primary bg-card">
        <div className="flex h-full items-center gap-2 px-3 lg:gap-4 lg:px-4">
          <SidebarTrigger />
          <span className="shrink-0 font-sans text-sm font-bold text-foreground sm:text-lg">CS LAWYERS <span className="hidden xl:inline">| ADVOCACIA</span></span>
          <QuickSearch />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="hidden max-w-56 text-right leading-tight lg:block">
              <p className="font-medium">{perfil?.nome}</p>
              <p className="text-xs text-muted-foreground">{perfil?.roles.join(", ")}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={sair}><LogOut />Sair</Button>
          </div>
        </div>
      </header>
      <div className="flex min-h-screen w-full pt-16">
        <AppSidebar />
        <main className="min-w-0 flex-1"><Outlet /></main>
      </div>
    </SidebarProvider>
  );
}
