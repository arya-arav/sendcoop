"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { copyPlanAction } from "./actions";

/** Copies a plan as a hidden draft and opens it. */
export function CopyPlanButton({ planId, name }: { planId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Copy ${name}`}
      onClick={() =>
        startTransition(async () => {
          await copyPlanAction(planId);
        })
      }
    >
      Copy
    </Button>
  );
}
