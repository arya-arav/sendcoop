import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Sendcoop",
  description: "Email marketing measured in revenue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // next-themes sets the theme class on <html> before hydration.
    <html lang="en" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-[14px] leading-normal text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
