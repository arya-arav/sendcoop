"use server";

import { savePlan } from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin";

const limit = z.number().int().min(0).max(1_000_000_000).nullable();
const planSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "The key is 2–40 lowercase letters, numbers or dashes."),
  name: z.string().trim().min(1, "Give the plan a name.").max(60),
  description: z.string().trim().max(300),
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  stripePriceId: z
    .string()
    .trim()
    .regex(/^(price_\w+)?$/, "A Stripe price id starts with price_.")
    .transform((v) => v || null),
  limits: z.object({
    subscribers: limit,
    sendsPerMonth: limit,
    workspaces: limit,
    teamMembers: limit,
  }),
  features: z.object({
    automations: z.boolean(),
    abTests: z.boolean(),
    aiAssist: z.boolean(),
    utmcap: z.boolean(),
    api: z.boolean(),
    removeBranding: z.boolean(),
  }),
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
  revalidatePath("/admin/plans");
  redirect("/admin/plans");
}
