import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Sendcoop",
  description: "Email marketing measured in revenue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // next-themes sets the theme class on <html> before hydration.
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
