"use client";

import {
  effectiveFeatures,
  effectiveLimits,
  FEATURE_GROUPS,
  FEATURE_LABELS,
  LIMIT_GROUPS,
  LIMIT_LABELS,
} from "@sendcoop/db/plans";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { type PlanFormInput, savePlanAction } from "../actions";

const BLANK: PlanFormInput = {
  key: "",
  name: "",
  description: "",
  priceCents: 0,
  currency: "USD",
  interval: "month",
  trialDays: 0,
  stripePriceId: "",
  limits: effectiveLimits({
    subscribers: 1000,
    sendsPerMonth: 10000,
    workspaces: 1,
    teamMembers: 1,
  }),
  features: effectiveFeatures({
    automations: false,
    abTests: false,
    aiAssist: false,
    utmcap: false,
    api: false,
    removeBranding: false,
  }),
  public: true,
  sortOrder: 10,
  archived: false,
};

/** A plan's price, billing, limits and features, in Acelle's groups. */
export function PlanForm({
  planId,
  initial,
}: {
  planId: string | null;
  initial: PlanFormInput | null;
}) {
  const start = initial ?? BLANK;
  const [plan, setPlan] = useState<PlanFormInput>({
    ...start,
    limits: effectiveLimits(start.limits),
    features: effectiveFeatures(start.features),
  });
  const [price, setPrice] = useState((start.priceCents / 100).toString());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PlanFormInput>(key: K, value: PlanFormInput[K]) =>
    setPlan((p) => ({ ...p, [key]: value }));

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const cents = Math.round(Number(price) * 100);
        if (!Number.isFinite(cents) || cents < 0) {
          setError("Enter the price, e.g. 19 or 0.");
          return;
        }
        startTransition(async () => {
          const result = await savePlanAction(planId, { ...plan, priceCents: cents });
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>General</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="plan-name">Name</Label>
                <Input
                  id="plan-name"
                  value={plan.name}
                  onChange={(e) => set("name", e.target.value)}
                />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Pricing and billing</h2>
            </CardTitle>
            <CardDescription>
              The Stripe price must charge the same amount on the same cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="plan-price">Price</Label>
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
                <Label htmlFor="plan-interval">Billed</Label>
                <NativeSelect
                  id="plan-interval"
                  className="w-full"
                  value={plan.interval}
                  onChange={(e) => set("interval", e.target.value as "month" | "year")}
                >
                  <NativeSelectOption value="month">Monthly</NativeSelectOption>
                  <NativeSelectOption value="year">Yearly</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="plan-trial">Free trial (days, 0 for none)</Label>
                <Input
                  id="plan-trial"
                  type="number"
                  min={0}
                  max={365}
                  value={plan.trialDays}
                  onChange={(e) => set("trialDays", Math.trunc(Number(e.target.value)))}
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Limits</h2>
          </CardTitle>
          <CardDescription>
            Across every workspace the account owns. Tick Unlimited to remove a limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-3">
          {LIMIT_GROUPS.map((group) => (
            <fieldset key={group.title} className="grid content-start gap-3">
              <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
              {group.keys.map((key) => {
                const value = plan.limits[key];
                return (
                  <div key={key} className="grid gap-1">
                    <Label htmlFor={`limit-${key}`}>{LIMIT_LABELS[key]}</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id={`limit-${key}`}
                        type="number"
                        min={0}
                        className="w-36"
                        disabled={value === null}
                        value={value ?? ""}
                        onChange={(e) =>
                          set("limits", {
                            ...plan.limits,
                            [key]: Math.max(0, Math.trunc(Number(e.target.value))),
                          })
                        }
                      />
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={`${LIMIT_LABELS[key]}: unlimited`}
                          checked={value === null}
                          onChange={(e) =>
                            set("limits", { ...plan.limits, [key]: e.target.checked ? null : 0 })
                          }
                        />
                        Unlimited
                      </label>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Features</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_GROUPS.map((group) => (
            <fieldset key={group.title} className="grid content-start gap-2">
              <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
              {group.keys.map((key) => (
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
          ))}
        </CardContent>
      </Card>

      <FormError message={error} />
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save plan"}
      </Button>
    </form>
  );
}
