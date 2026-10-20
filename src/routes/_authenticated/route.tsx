import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { officeDashboard } from "@/lib/office.functions";
import { buildAssessor } from "@/lib/assessor";
import { localDay } from "@/lib/dashboard";
import { loadOffice } from "@/lib/office-store";
import { setAuditUser, setModoDemonstracao } from "@/services/n8n";
import { useOfficeNotifications } from "@/hooks/use-office-notifications";
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
      return { nome: p.data?.nome ?? user.email ?? "", roleIds: (r.data ?? []).map(x=>x.role), roles: (r.data ?? []).map((x) => roleLabel[x.role] ?? x.role) };
    },
  });

  const read=useServerFn(officeDashboard);
  const dashboard=useQuery({queryKey:["dashboard",user.id],queryFn:()=>read(),refetchInterval:15000});
  const workspace=useQuery({queryKey:["office",user.id],queryFn:()=>loadOffice(user.id)});
  useOfficeNotifications(dashboard.data?.cases);
  const badges=buildAssessor(dashboard.data?.cases??[],localDay()).badges;
  useEffect(()=>{if(perfil)setAuditUser({id:user.id,nome:perfil.nome,perfil:perfil.roles.join(", ")});},[perfil,user.id]);
  useEffect(()=>{setModoDemonstracao(workspace.data?.demo??true);},[workspace.data?.demo]);
  const sair = async () => {
    setAuditUser({id:"",nome:"",perfil:""});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };

  return (
    <SidebarProvider>
      <header className="fixed inset-x-0 top-0 z-30 h-16 border-b border-primary bg-card">
        <div className="flex h-full items-center gap-2 px-3 lg:gap-4 lg:px-4">
          <SidebarTrigger />
          <div className="min-w-0 font-serif"><p className="text-sm font-bold text-foreground sm:text-lg">CS LAWYERS | ADVOCACIA</p><p className="text-[10px] font-semibold text-primary lg:text-xs">BRASIL • DUBAI • PORTUGAL</p></div>
          <QuickSearch />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="max-w-40 text-right leading-tight sm:max-w-56">
              {(workspace.data?.demo??true)&&<span className="hidden text-[10px] text-primary sm:block">Modo demonstração</span>}
              <p className="truncate text-xs font-medium">{perfil?.nome}</p>
              <p className="hidden text-[10px] text-muted-foreground sm:block">{perfil?.roles.join(", ")}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={sair}><LogOut />Sair</Button>
          </div>
        </div>
      </header>
      <div className="flex min-h-screen w-full pt-16">
        <AppSidebar badges={badges} />
        <main className="min-w-0 flex-1"><Outlet /></main>
      </div>
    </SidebarProvider>
  );
}
