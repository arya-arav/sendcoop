import { listUserWorkspaces } from "@sendcoop/db";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { stopImpersonatingAction } from "@/lib/impersonation-actions";
import { getSession } from "@/lib/session";
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
  const [userWorkspaces, cookieStore, session] = await Promise.all([
    listUserWorkspaces(user.id),
    cookies(),
    getSession(),
  ]);
  // A super-admin logged in as this customer (D75).
  const impersonating = Boolean(session?.session.impersonatedBy);
  // The sidebar component stores its open/collapsed state in this cookie.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        workspaces={userWorkspaces}
        current={{ id: workspace.id, slug: workspace.slug, name: workspace.name }}
        role={role}
        user={{ name: user.name, email: user.email }}
        isAdmin={(user as { role?: string | null }).role === "admin"}
      />
      <SidebarInset>
        {impersonating && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
          >
            <span>
              You&apos;re viewing Sendcoop as {user.name} ({user.email}).
            </span>
            <form action={stopImpersonatingAction}>
              <Button type="submit" size="sm" variant="outline">
                Stop viewing as them
              </Button>
            </form>
          </div>
        )}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-sm text-muted-foreground">{workspace.name}</span>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
