import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";

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
    navigate({ to: "/auth", replace: true });
  };

  return (
    <SidebarProvider>
      <header className="fixed inset-x-0 top-0 z-30 h-16 border-b-2 border-primary bg-card">
        <div className="flex h-full items-center gap-4 px-4">
          <SidebarTrigger />
          <span className="font-sans text-lg font-bold tracking-wide text-foreground">CS LAWYERS | ADVOCACIA</span>
          <span className="hidden text-xs font-semibold tracking-[0.2em] text-primary [font-variant:small-caps] sm:inline">Brasil • Dubai • Portugal</span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
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
