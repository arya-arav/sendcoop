"use server";

import {
  FEATURE_LABELS,
  getPlan,
  LIMIT_LABELS,
  type PlanFeatures,
  type PlanLimits,
  savePlan,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAdminAction, requireSuperAdmin } from "@/lib/admin";

const limit = z.number().int().min(0).max(1_000_000_000).nullable();
const limits = z.object(
  Object.fromEntries(Object.keys(LIMIT_LABELS).map((k) => [k, limit])) as Record<
    keyof PlanLimits,
    typeof limit
  >,
);
const features = z.object(
  Object.fromEntries(Object.keys(FEATURE_LABELS).map((k) => [k, z.boolean()])) as Record<
    keyof PlanFeatures,
    z.ZodBoolean
  >,
);

const planSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "The key is 2–40 lowercase letters, numbers or dashes."),
  name: z.string().trim().min(1, "Give the plan a name.").max(60),
  description: z.string().trim().max(300),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  interval: z.enum(["month", "year"]),
  trialDays: z.number().int().min(0, "Trial days can't be negative.").max(365),
  stripePriceId: z
    .string()
    .trim()
    .regex(/^(price_\w+)?$/, "A Stripe price id starts with price_.")
    .transform((v) => v || null),
  limits,
  features,
  public: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  archived: z.boolean(),
});

export type PlanFormInput = z.input<typeof planSchema>;

export async function savePlanAction(planId: string | null, input: PlanFormInput) {
  await requireSuperAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]!.message };
  const result = await savePlan(planId, parsed.data);
  if (!result.ok) return result;
  await logAdminAction(planId ? "plan.saved" : "plan.created", result.plan.id, {
    key: result.plan.key,
  });
  revalidatePath("/admin/plans");
  redirect("/admin/plans");
}

/** Copies a plan as a hidden draft to edit ("…-copy"). */
export async function copyPlanAction(planId: string) {
  await requireSuperAdmin();
  const plan = await getPlan(planId);
  if (!plan) return { ok: false as const, error: "No such plan." };
  for (let n = 1; n <= 20; n++) {
    const key = `${plan.key}-copy${n > 1 ? `-${n}` : ""}`.slice(0, 40);
    const result = await savePlan(null, {
      key,
      name: `${plan.name} (copy)`,
      description: plan.description,
      priceCents: plan.priceCents,
      currency: plan.currency,
      interval: plan.interval,
      trialDays: plan.trialDays,
      stripePriceId: null,
      limits: plan.limits,
      features: plan.features,
      public: false,
      sortOrder: plan.sortOrder + 1,
      archived: false,
    });
    if (result.ok) {
      await logAdminAction("plan.copied", result.plan.id, { from: plan.key });
      revalidatePath("/admin/plans");
      redirect(`/admin/plans/${result.plan.id}`);
    }
  }
  return { ok: false as const, error: "Couldn't find a free key for the copy." };
}
