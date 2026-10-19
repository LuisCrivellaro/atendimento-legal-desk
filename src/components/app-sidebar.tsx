import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, MessageCircle, FileText, ShieldCheck, Landmark, Activity, Brain, Settings, ClipboardCheck } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuBadge } from "@/components/ui/sidebar";

const items = [
  { title: "Assessor", url: "/", icon: Compass, badge: 3 },
  { title: "Atendimento", url: "/atendimento", icon: MessageCircle, badge: 3 },
  { title: "Produção", url: "/producao", icon: FileText, badge: 4 },
  { title: "Aprovações", url: "/aprovacoes", icon: ClipboardCheck, badge: 0 },
  { title: "Auditoria", url: "/auditoria", icon: ShieldCheck, badge: 2 },
  { title: "Protocolo", url: "/protocolo", icon: Landmark, badge: 1 },
  { title: "Andamentos", url: "/andamentos", icon: Activity, badge: 5 },
  { title: "Treinamento de IA", url: "/treinamento", icon: Brain, badge: 0 },
  { title: "Configurações", url: "/configuracoes", icon: Settings, badge: 0 },
] as const;

export function AppSidebar() {
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
                  {i.badge > 0 && <SidebarMenuBadge className="bg-pending text-pending-foreground">{i.badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
