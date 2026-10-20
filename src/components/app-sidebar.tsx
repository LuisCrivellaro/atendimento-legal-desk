import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, MessageCircle, FileText, ShieldCheck, Landmark, Activity, Brain, Settings, ClipboardCheck, Users, Plug } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuBadge } from "@/components/ui/sidebar";

const items = [
  { title: "Assessor", url: "/", icon: Compass },
  { title: "Atendimento", url: "/atendimento", icon: MessageCircle },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Produção", url: "/producao", icon: FileText },
  { title: "Aprovações", url: "/aprovacoes", icon: ClipboardCheck },
  { title: "Auditoria", url: "/auditoria", icon: ShieldCheck },
  { title: "Protocolo", url: "/protocolo", icon: Landmark },
  { title: "Andamentos", url: "/andamentos", icon: Activity },
  { title: "Treinamento de IA", url: "/treinamento", icon: Brain },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
  { title: "Integrações", url: "/integracoes", icon: Plug },
] as const;

export function AppSidebar({badges={}}:{badges?:Record<string,number>}) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <Sidebar collapsible="icon" className="top-16 h-[calc(100svh-4rem)]">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={path === i.url} tooltip={i.title}>
                    <Link to={i.url}><i.icon /><span>{i.title}</span></Link>
                  </SidebarMenuButton>
                  {(badges[i.url]??0) > 0 && <SidebarMenuBadge className={i.url==="/"?"bg-destructive text-destructive-foreground":"bg-pending text-pending-foreground"}>{badges[i.url]}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
