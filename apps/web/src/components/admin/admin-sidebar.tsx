"use client";

import {
  Activity,
  Ban,
  BookOpen,
  CreditCard,
  FileText,
  Gauge,
  Globe,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MailWarning,
  Receipt,
  ScrollText,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/shell/nav-user";

type Item = { title: string; href: string; icon: LucideIcon; ready: boolean };

// The super-admin area, grouped as in the plan for running Sendcoop. Items
// turn ready as they're built.
const groups: { label: string | null; items: Item[] }[] = [
  {
    label: null,
    items: [{ title: "Dashboard", href: "/admin", icon: LayoutDashboard, ready: true }],
  },
  {
    label: "Customers",
    items: [
      { title: "Customers", href: "/admin/customers", icon: Users, ready: true },
      { title: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard, ready: true },
      { title: "Invoices", href: "/admin/invoices", icon: Receipt, ready: true },
    ],
  },
  {
    label: "Plans & billing",
    items: [
      { title: "Plans", href: "/admin/plans", icon: Tags, ready: true },
      { title: "Payment gateway", href: "/admin/payments", icon: Wallet, ready: true },
    ],
  },
  {
    label: "Sending",
    items: [
      { title: "Sending servers", href: "/admin/sending-servers", icon: Server, ready: false },
      { title: "Sending domains", href: "/admin/sending-domains", icon: Globe, ready: false },
      { title: "Campaign monitor", href: "/admin/campaigns", icon: Send, ready: false },
      { title: "Bounces & complaints", href: "/admin/feedback", icon: MailWarning, ready: false },
    ],
  },
  {
    label: "Templates",
    items: [{ title: "Email templates", href: "/admin/templates", icon: Mail, ready: false }],
  },
  {
    label: "Administration",
    items: [
      { title: "Admins", href: "/admin/admins", icon: UserCog, ready: false },
      { title: "Activity log", href: "/admin/activity", icon: Activity, ready: false },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Settings", href: "/admin/settings", icon: Settings, ready: false },
      { title: "Abuse protection", href: "/admin/abuse", icon: ShieldCheck, ready: false },
    ],
  },
  {
    label: "Logs & monitor",
    items: [
      { title: "Tracking log", href: "/admin/logs", icon: ScrollText, ready: false },
      { title: "Blacklist", href: "/admin/blacklist", icon: Ban, ready: false },
      { title: "System status", href: "/admin/status", icon: Gauge, ready: false },
    ],
  },
  {
    label: "Help",
    items: [
      { title: "Help center", href: "/help", icon: BookOpen, ready: true },
      { title: "API reference", href: "/api/v1/openapi.json", icon: FileText, ready: true },
    ],
  },
];

export function AdminSidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/admin" className="flex h-10 items-center gap-2 px-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs text-primary-foreground">
            S
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">Sendcoop admin</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label ?? "top"} className="py-1">
            {group.label && (
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wider uppercase">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active =
                    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      {item.ready ? (
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.title}
                          render={<Link href={item.href} />}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      ) : (
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
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} admin="app" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
