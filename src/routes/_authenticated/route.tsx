import { createFileRoute, Outlet, redirect, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { officeDashboard } from "@/lib/office.functions";
import { buildAssessor } from "@/lib/assessor";
import { replyQueue } from "@/lib/atendimento";
import { consultaCasos } from "@/lib/casos";
import { useCasosRealtime } from "@/hooks/use-casos-realtime";
import { localDay } from "@/lib/dashboard";
import { setAuditUser } from "@/services/integracoes";
import { useOfficeNotifications } from "@/hooks/use-office-notifications";
import { LogOut, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { QuickSearch } from '@/components/quick-search';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import logoManagerAdv from '@/assets/brand/manager-adv-logo.png';

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
  const navegando = useRouterState({ select: (s) => s.status === "pending" });
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
  // Painel pesado (escritório inteiro + status de aprovação por caso): 60 s bastam; conversas chegam pelo tempo real.
  const dashboard=useQuery({queryKey:["dashboard",user.id],queryFn:()=>read(),refetchInterval:60000});
  useCasosRealtime(user.id);
  // Só observa o cache das conversas (nunca busca aqui): quando o Atendimento já carregou, o contador do menu usa
  // exatamente a mesma lista e a mesma regra da aba "Aguardando".
  const {data:casos}=useQuery({...consultaCasos,enabled:false});
  useOfficeNotifications(dashboard.data?.cases);
  const assessor=buildAssessor(dashboard.data?.cases??[],localDay()).badges;
  const badges=casos?{...assessor,'/atendimento':replyQueue(casos).length}:assessor;
  useEffect(()=>{if(perfil)setAuditUser({id:user.id,nome:perfil.nome,perfil:perfil.roles.join(", ")});},[perfil,user.id]);
  const sair = async () => {
    setAuditUser({id:"",nome:"",perfil:""});
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };

  const papelPrincipal = roleLabel[['advogada_senior','advogado_junior','admin','atendente','operacoes'].find(r=>perfil?.roleIds.includes(r as typeof perfil.roleIds[number]))??''];
  const iniciais = (perfil?.nome ?? '').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

  return (
    <SidebarProvider>
      <RecolherMenuNoAtendimento />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring">Pular para o conteúdo</a>
      <header className="fixed inset-x-0 top-0 z-30 office-header border-b bg-card">
        <div className="flex h-full items-center gap-2 px-3 lg:gap-4 lg:px-4">
          <SidebarTrigger className="size-8 shrink-0 text-muted-foreground hover:text-foreground" />
          <div className="flex min-w-0 shrink-0 items-center gap-2 md:pr-2"><img src={logoManagerAdv} alt="" width={27} height={32} className="brand-logo h-8" /><p translate="no" className="brand-lockup text-[15px] sm:text-base">MANAGER ADV</p></div>
          <QuickSearch />
          <div className="ml-auto flex min-w-0 items-center gap-1 text-sm md:gap-2">
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-10 min-w-0 gap-2 px-1.5 text-left"><span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-turquoise-100 text-2xs font-semibold text-turquoise-800">{iniciais}</span><span className="block max-w-20 leading-tight max-sm:sr-only md:max-w-48"><span className="block truncate text-xs font-medium">{perfil?.nome}</span><span className="hidden truncate text-2xs text-muted-foreground sm:block">{papelPrincipal}</span></span><ChevronDown className="size-3 shrink-0 text-muted-foreground"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Perfis de acesso</DropdownMenuLabel><DropdownMenuSeparator/>{perfil?.roles.map(r=><DropdownMenuLabel key={r} className="text-xs font-normal">{r}</DropdownMenuLabel>)}</DropdownMenuContent></DropdownMenu>
            <Button variant="ghost" size="sm" className="shrink-0 px-2 text-muted-foreground hover:text-foreground" aria-label="Sair" onClick={sair}><LogOut /><span className="hidden md:inline">Sair</span></Button>
          </div>
        </div>
      </header>
      <div className="flex min-h-screen w-full office-content">
        <AppSidebar badges={badges} podeContencioso={!!perfil?.roleIds.some((r) => r === "advogada_senior" || r === "admin")} />
        {navegando && <div className="barra-navegacao" role="progressbar" aria-label="Carregando a tela" />}
        <main id="conteudo" tabIndex={-1} className="conteudo-transicao min-w-0 flex-1 outline-none"><Outlet /></main>
      </div>
    </SidebarProvider>
  );
}

// No Atendimento, em telas com menos de 1536px, o menu abre recolhido (só ícones, com tooltip) para a conversa ganhar
// espaço. A pessoa pode abrir o menu quando quiser; ao sair do Atendimento, o menu volta como estava, a menos que a
// pessoa tenha mexido nele no meio do caminho.
function RecolherMenuNoAtendimento() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { open, setOpen, isMobile } = useSidebar();
  const recolhidoAqui = useRef(false);
  const abertoAntes = useRef(open);
  const noAtendimento = path === "/atendimento";
  // Se a pessoa reabrir o menu no Atendimento, ele não volta a fechar sozinho nem muda ao sair.
  useEffect(() => {
    if (noAtendimento && open && !abertoAntes.current) recolhidoAqui.current = false;
    abertoAntes.current = open;
  }, [noAtendimento, open]);
  useEffect(() => {
    if (isMobile) return;
    if (noAtendimento && open && window.innerWidth < 1536) { recolhidoAqui.current = true; setOpen(false); return; }
    if (!noAtendimento && recolhidoAqui.current) { recolhidoAqui.current = false; if (!open) setOpen(true); }
    // Só reage à troca de tela: abrir ou fechar o menu dentro do Atendimento é escolha da pessoa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noAtendimento, isMobile]);
  return null;
}
