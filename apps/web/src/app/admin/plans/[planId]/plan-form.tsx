"use client";

import {
  FEATURE_LABELS,
  LIMIT_LABELS,
  type PlanFeatures,
  type PlanLimits,
} from "@sendcoop/db/plans";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type PlanFormInput, savePlanAction } from "../actions";

const BLANK: PlanFormInput = {
  key: "",
  name: "",
  description: "",
  priceCents: 0,
  currency: "USD",
  stripePriceId: "",
  limits: { subscribers: 1000, sendsPerMonth: 10000, workspaces: 1, teamMembers: 1 },
  features: {
    automations: false,
    abTests: false,
    aiAssist: false,
    utmcap: false,
    api: false,
    removeBranding: false,
  },
  public: true,
  sortOrder: 10,
  archived: false,
};

/** A plan's price, limits and features. Empty limits are unlimited. */
export function PlanForm({
  planId,
  initial,
}: {
  planId: string | null;
  initial: PlanFormInput | null;
}) {
  const [plan, setPlan] = useState<PlanFormInput>(initial ?? BLANK);
  const [price, setPrice] = useState(((initial ?? BLANK).priceCents / 100).toString());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PlanFormInput>(key: K, value: PlanFormInput[K]) =>
    setPlan((p) => ({ ...p, [key]: value }));

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const cents = Math.round(Number(price) * 100);
        if (!Number.isFinite(cents) || cents < 0) {
          setError("Enter the monthly price, e.g. 19 or 0.");
          return;
        }
        startTransition(async () => {
          const result = await savePlanAction(planId, { ...plan, priceCents: cents });
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="plan-name">Name</Label>
          <Input id="plan-name" value={plan.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="plan-key">Key</Label>
          <Input
            id="plan-key"
            value={plan.key}
            onChange={(e) => set("key", e.target.value.trim())}
          />
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="plan-description">Description</Label>
        <Textarea
          id="plan-description"
          rows={2}
          value={plan.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="plan-price">Price a month</Label>
          <Input
            id="plan-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="plan-currency">Currency</Label>
          <Input
            id="plan-currency"
            value={plan.currency}
            maxLength={3}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="plan-stripe">Stripe price id</Label>
          <Input
            id="plan-stripe"
            placeholder="price_…"
            value={plan.stripePriceId ?? ""}
            onChange={(e) => set("stripePriceId", e.target.value)}
          />
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Limits (empty: unlimited)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((key) => (
            <div key={key} className="grid gap-1">
              <Label htmlFor={`limit-${key}`}>{LIMIT_LABELS[key]}</Label>
              <Input
                id={`limit-${key}`}
                type="number"
                min={0}
                value={plan.limits[key] ?? ""}
                onChange={(e) =>
                  set("limits", {
                    ...plan.limits,
                    [key]: e.target.value === "" ? null : Math.trunc(Number(e.target.value)),
                  })
                }
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Features</legend>
        {(Object.keys(FEATURE_LABELS) as (keyof PlanFeatures)[]).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={plan.features[key]}
              onChange={(e) => set("features", { ...plan.features, [key]: e.target.checked })}
            />
            {FEATURE_LABELS[key]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={plan.public}
            onChange={(e) => set("public", e.target.checked)}
          />
          Public (customers can choose it)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={plan.archived}
            onChange={(e) => set("archived", e.target.checked)}
          />
          Archived
        </label>
        <div className="grid gap-1">
          <Label htmlFor="plan-order">Order</Label>
          <Input
            id="plan-order"
            type="number"
            className="w-24"
            value={plan.sortOrder}
            onChange={(e) => set("sortOrder", Math.trunc(Number(e.target.value)))}
          />
        </div>
      </div>
      <FormError message={error} />
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save plan"}
      </Button>
    </form>
  );
}
