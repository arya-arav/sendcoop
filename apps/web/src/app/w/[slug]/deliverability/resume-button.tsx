"use client";

import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resumeCampaignAction } from "./actions";

export function ResumeButton({
  slug,
  campaignId,
  name,
}: {
  slug: string;
  campaignId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-label={`Resume ${name}`}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resumeCampaignAction(slug, campaignId);
            setError(result.ok ? null : result.error);
          })
        }
      >
        <Play />
        {pending ? "Resuming…" : "Resume"}
      </Button>
    </div>
  );
}
