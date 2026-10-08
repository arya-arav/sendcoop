import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { template: "%s · Sendcoop help", default: "Sendcoop help" },
};

/** The public help center (D83): no sign-in needed. */
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <nav
          aria-label="Help"
          className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm"
        >
          <Link href="/help" className="font-semibold">
            Sendcoop help
          </Link>
          <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
            Open Sendcoop
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
