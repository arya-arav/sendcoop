import { listUserWorkspaces } from "@sendcoop/db";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireMemberWorkspace } from "@/lib/workspace";

// Every page under /w/<slug> requires membership in that workspace.
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { user, workspace, role } = await requireMemberWorkspace((await params).slug);
  const [userWorkspaces, cookieStore] = await Promise.all([listUserWorkspaces(user.id), cookies()]);
  // The sidebar component stores its open/collapsed state in this cookie.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        workspaces={userWorkspaces}
        current={{ id: workspace.id, slug: workspace.slug, name: workspace.name }}
        role={role}
        user={{ name: user.name, email: user.email }}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-sm text-muted-foreground">{workspace.name}</span>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
