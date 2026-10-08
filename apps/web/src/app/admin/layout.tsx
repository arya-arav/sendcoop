import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: { template: "%s · Sendcoop admin", default: "Sendcoop admin" },
};

/** The super-admin area: running Sendcoop itself. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <nav
          aria-label="Admin"
          className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm"
        >
          <span className="font-semibold">Sendcoop admin</span>
          <Link href="/admin/plans" className="text-muted-foreground hover:text-foreground">
            Plans
          </Link>
          <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
            Back to the app
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
