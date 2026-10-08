import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { type WorkspaceSummary, WorkspaceSwitcher } from "./workspace-switcher";

export function AppSidebar({
  workspaces,
  current,
  role,
  user,
  isAdmin = false,
}: {
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary;
  role: string;
  user: { name: string; email: string };
  isAdmin?: boolean;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} current={current} role={role} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain slug={current.slug} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} admin={isAdmin ? "panel" : undefined} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
