"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCampaignCostAction } from "../../actions";

/** What the campaign cost: revenue reports show its return. */
export function CostForm({
  slug,
  campaignId,
  cost,
  currency,
}: {
  slug: string;
  campaignId: string;
  cost: number | null;
  currency: string;
}) {
  const [value, setValue] = useState(cost === null ? "" : String(cost));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setCampaignCostAction(slug, campaignId, value);
          if (!result.ok) setError(result.error);
          else setMessage("Saved.");
        });
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor="campaign-cost">Campaign cost ({currency}, optional)</Label>
        <Input
          id="campaign-cost"
          inputMode="decimal"
          className="w-40"
          value={value}
          placeholder="e.g. 250"
          onChange={(e) => {
            setValue(e.target.value);
            setMessage(null);
          }}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save cost"}
      </Button>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <FormError message={error} />
    </form>
  );
}
