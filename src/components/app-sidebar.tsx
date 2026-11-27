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
    <Sidebar collapsible="icon" className="top-[var(--header-h)] h-[calc(100svh-var(--header-h))] border-r-0">
      <SidebarContent className="office-nav gap-0.5 py-2">
        {groups.filter((g) => !g.restrito || podeContencioso).map((g, gi) => (
          // Recolhido (56px): 12px de cada lado centralizam o ícone de 32px.
          <SidebarGroup key={g.label ?? gi} className="py-1 group-data-[collapsible=icon]:px-3">
            {g.label && (
              <SidebarGroupLabel className="office-nav-label h-7">{g.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={g.flow ? "office-flow gap-0.5" : "gap-0.5"}>
                {g.items.map((i) => {
                  const n = badges[i.url] ?? 0;
                  // O Painel conta prazos fatais (crítico); os demais, itens aguardando a etapa.
                  const critico = i.url === "/";
                  return (
                    <SidebarMenuItem key={i.url}>
                      <SidebarMenuButton asChild isActive={path === i.url} tooltip={n > 0 ? `${i.title} · ${n}` : i.title}>
                        <Link to={i.url} onClick={() => isMobile && setOpenMobile(false)}>
                          <i.icon />
                          <span>{i.title}</span>
                          {n > 0 && <span className="sr-only"> ({n})</span>}
                        </Link>
                      </SidebarMenuButton>
                      {n > 0 && (
                        <>
                          <SidebarMenuBadge
                            aria-hidden
                            className={
                              // O item ativo/hover deixa o texto branco; o número mantém a cor própria.
                              critico
                                ? "bg-sidebar-badge-critical text-sidebar-badge-critical-foreground peer-hover/menu-button:text-sidebar-badge-critical-foreground peer-data-[active=true]/menu-button:text-sidebar-badge-critical-foreground"
                                : "bg-sidebar-badge text-sidebar-badge-foreground peer-hover/menu-button:text-sidebar-badge-foreground peer-data-[active=true]/menu-button:text-sidebar-badge-foreground"
                            }
                          >
                            {n}
                          </SidebarMenuBadge>
                          {/* Menu recolhido: ponto no canto do ícone; o número aparece no tooltip. */}
                          <span
                            aria-hidden
                            className={`pointer-events-none absolute right-0.5 top-0.5 hidden size-2 rounded-full ring-2 ring-sidebar group-data-[collapsible=icon]:block ${critico ? "bg-destructive" : "bg-warning-500"}`}
                          />
                        </>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
