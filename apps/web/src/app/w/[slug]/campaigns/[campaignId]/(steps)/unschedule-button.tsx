"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { unscheduleCampaignAction } from "../../actions";

/** Back to a draft, to change it or send it some other way. */
export function UnscheduleButton({ slug, campaignId }: { slug: string; campaignId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await unscheduleCampaignAction(slug, campaignId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel schedule"}
      </Button>
    </div>
  );
}
