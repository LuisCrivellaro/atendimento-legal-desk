import { Link, useRouterState } from "@tanstack/react-router";
import {
  Compass,
  MessageCircle,
  FileText,
  ShieldCheck,
  Landmark,
  Activity,
  Brain,
  Settings,
  ClipboardCheck,
  Users,
  Plug,
  Scale,
  ScrollText,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  useSidebar,
} from "@/components/ui/sidebar";

type Item = { title: string; url: string; icon: typeof Compass };

// Grupos do menu. "Fluxo do caso" segue a ordem real de trabalho do escritório e ganha a linha que liga as etapas.
const groups: { label?: string; flow?: boolean; restrito?: boolean; items: Item[] }[] = [
  { items: [{ title: "Painel", url: "/", icon: Compass }] },
  {
    label: "Fluxo do caso",
    flow: true,
    items: [
      { title: "Atendimento", url: "/atendimento", icon: MessageCircle },
      { title: "Produção", url: "/producao", icon: FileText },
      { title: "Aprovações", url: "/aprovacoes", icon: ClipboardCheck },
      { title: "Auditoria", url: "/auditoria", icon: ShieldCheck },
      { title: "Protocolo", url: "/protocolo", icon: Landmark },
      { title: "Andamentos", url: "/andamentos", icon: Activity },
    ],
  },
  { label: "Cadastros", items: [{ title: "Clientes", url: "/clientes", icon: Users }] },
  // Só advogada sênior e administração acessam o Contencioso (o servidor também barra os demais perfis).
  { label: "Contencioso", restrito: true, items: [{ title: "Processos", url: "/contencioso/processos", icon: Scale }, { title: "Andamentos processuais", url: "/contencioso/andamentos", icon: ScrollText }] },
  {
    label: "Escritório",
    items: [
      { title: "Treinamento de IA", url: "/treinamento", icon: Brain },
      { title: "Configurações", url: "/configuracoes", icon: Settings },
      { title: "Integrações", url: "/integracoes", icon: Plug },
    ],
  },
];

export function AppSidebar({ badges = {}, podeContencioso = false }: { badges?: Record<string, number>; podeContencioso?: boolean }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  // No celular o menu abre por cima da tela; fecha ao escolher um destino.
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" className="top-16 h-[calc(100svh-4rem)] border-r-0">
      <SidebarContent className="office-nav gap-1 py-2">
        {groups.filter((g) => !g.restrito || podeContencioso).map((g, gi) => (
          <SidebarGroup key={g.label ?? gi} className="py-1">
            {g.label && (
              <SidebarGroupLabel className="office-nav-label h-7">{g.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={g.flow ? "office-flow" : undefined}>
                {g.items.map((i) => (
                  <SidebarMenuItem key={i.url}>
                    <SidebarMenuButton asChild isActive={path === i.url} tooltip={i.title}>
                      <Link to={i.url} onClick={() => isMobile && setOpenMobile(false)}>
                        <i.icon />
                        <span>{i.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {(badges[i.url] ?? 0) > 0 && (
                      <SidebarMenuBadge
                        className={
                          // O item ativo/hover do menu deixa o texto branco; o número do badge mantém a cor própria.
                          i.url === "/"
                            ? "bg-destructive text-destructive-foreground peer-hover/menu-button:text-destructive-foreground peer-data-[active=true]/menu-button:text-destructive-foreground"
                            : "bg-pending text-pending-foreground peer-hover/menu-button:text-pending-foreground peer-data-[active=true]/menu-button:text-pending-foreground"
                        }
                      >
                        {badges[i.url]}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
