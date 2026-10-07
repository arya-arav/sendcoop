"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { type CheckResult, checkDomainAction } from "../actions";

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "short" });

export function CheckNow({
  slug,
  domainId,
  lastCheckedAt,
}: {
  slug: string;
  domainId: string;
  lastCheckedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CheckResult | null>(null);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(await checkDomainAction(slug, domainId));
            })
          }
        >
          <RefreshCw className={pending ? "animate-spin" : undefined} />
          {pending ? "Checking…" : "Check now"}
        </Button>
        <span className="text-sm text-muted-foreground">
          {lastCheckedAt
            ? `Last checked at ${timeFormat.format(new Date(lastCheckedAt))}. We also check every 10 minutes.`
            : "We check every 10 minutes."}
        </span>
      </div>
      {result?.ok && (
        <div role="status" className="text-sm">
          {result.problems.length === 0 ? (
            <p className="font-medium">All three records found. This domain is verified.</p>
          ) : (
            <ul className="list-disc pl-5 text-muted-foreground">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
