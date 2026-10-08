"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createCampaignAction } from "./actions";

export function NewCampaignButton({
  slug,
  label = "New campaign",
}: {
  slug: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid justify-items-center gap-2">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createCampaignAction(slug);
            if (result?.error) setError(result.error);
          })
        }
      >
        <Plus />
        {pending ? "Creating…" : label}
      </Button>
    </div>
  );
}
