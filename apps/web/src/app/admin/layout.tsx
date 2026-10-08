import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireSuperAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: { template: "%s · Sendcoop admin", default: "Sendcoop admin" },
};

/** The super-admin area: running Sendcoop itself. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSuperAdmin();
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AdminSidebar user={{ name: user.name, email: user.email }} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
          <SidebarTrigger className="-ml-1" />
          <span className="text-sm text-muted-foreground">Admin</span>
          <Link href="/" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
            Back to the app
          </Link>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
