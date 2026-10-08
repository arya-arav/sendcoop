"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The builder's steps. Steps not built yet are listed but not linked.
const STEPS = [
  { path: "recipients", label: "Recipients", ready: true },
  { path: "content", label: "Content", ready: false },
  { path: "schedule", label: "Schedule", ready: false },
];

export function CampaignSteps({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Campaign steps">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((step, i) => {
          const current = pathname.endsWith(`/${step.path}`);
          const label = (
            <>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs",
                  current && "border-foreground bg-foreground text-background",
                )}
              >
                {i + 1}
              </span>
              {step.label}
            </>
          );
          return (
            <li key={step.path}>
              {step.ready ? (
                <Link
                  href={`${base}/${step.path}`}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
                    current ? "font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ) : (
                <span className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground/60">
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
