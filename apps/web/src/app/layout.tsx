import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sendcoop",
  description: "Email marketing measured in revenue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
