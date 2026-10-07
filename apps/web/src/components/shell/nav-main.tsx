"use client";

import {
  BarChart3,
  FileText,
  FormInput,
  Filter,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Mail,
  Plug,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = { title: string; path: string; icon: LucideIcon; ready: boolean };

// Paths are relative to /w/<slug>. Items flip to ready as their roadmap phase ships.
const items: NavItem[] = [
  { title: "Dashboard", path: "", icon: LayoutDashboard, ready: true },
  { title: "Contacts", path: "/contacts", icon: Users, ready: true },
  { title: "Lists", path: "/lists", icon: ListChecks, ready: true },
  { title: "Segments", path: "/segments", icon: Filter, ready: true },
  { title: "Forms", path: "/forms", icon: FormInput, ready: true },
  { title: "Campaigns", path: "/campaigns", icon: Mail, ready: false },
  { title: "Automations", path: "/automations", icon: Workflow, ready: false },
  { title: "Templates", path: "/templates", icon: FileText, ready: false },
  { title: "Revenue", path: "/revenue", icon: BarChart3, ready: false },
  { title: "Integrations", path: "/integrations", icon: Plug, ready: false },
  { title: "Settings", path: "/settings", icon: Settings, ready: true },
];

export function NavMain({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/w/${slug}`;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const href = base + item.path;
            const isActive = item.path ? pathname.startsWith(href) : pathname === base;
            return (
              <SidebarMenuItem key={item.title}>
                {item.ready ? (
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.title}
                    render={<Link href={href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  // No tooltip here: the tooltip trigger would swallow `disabled`.
                  <SidebarMenuButton disabled>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                )}
                {!item.ready && <SidebarMenuBadge>Soon</SidebarMenuBadge>}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
