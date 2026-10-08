"use server";

import {
  getPlan,
  LIMIT_LABELS,
  type PlanLimits,
  setAccountOverrides,
  setAccountPlan,
} from "@sendcoop/db";
import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";

// Super-admin actions on one customer (D75). Suspending and logging in as
// them go through Better Auth's admin plugin, which checks the caller is an
// admin again and won't act on other admins.

type Result = { ok: true; message?: string } | { ok: false; error: string };

const userId = z.uuid();

async function call(action: () => Promise<unknown>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (error) {
    if (error instanceof APIError) return error.body?.message ?? error.message;
    throw error;
  }
}

export async function changePlanAction(customerId: string, planId: string): Promise<Result> {
  await requireSuperAdmin();
  if (!userId.safeParse(customerId).success) return { ok: false, error: "No such customer." };
  const plan = await getPlan(planId);
  if (!plan) return { ok: false, error: "No such plan." };
  await setAccountPlan(customerId, plan.id, { status: "active", cancelAtPeriodEnd: false });
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, message: `Now on ${plan.name}.` };
}

/** Each limit: "" keeps the plan's, "unlimited" lifts it, a number replaces it. */
export async function saveOverridesAction(
  customerId: string,
  input: Record<string, string>,
): Promise<Result> {
  await requireSuperAdmin();
  if (!userId.safeParse(customerId).success) return { ok: false, error: "No such customer." };
  const limits: Partial<PlanLimits> = {};
  for (const key of Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]) {
    const value = (input[key] ?? "").trim().toLowerCase();
    if (value === "") continue;
    if (value === "unlimited") limits[key] = null;
    else if (/^\d{1,9}$/.test(value)) limits[key] = Number(value);
    else return { ok: false, error: `${LIMIT_LABELS[key]}: a number, "unlimited" or blank.` };
  }
  const trusted = input.trusted === "true";
  await setAccountOverrides(
    customerId,
    Object.keys(limits).length > 0 || trusted
      ? { ...(Object.keys(limits).length > 0 && { limits }), ...(trusted && { trusted }) }
      : null,
  );
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, message: "Overrides saved." };
}

export async function suspendAction(customerId: string, reason: string): Promise<Result> {
  await requireSuperAdmin();
  const banReason = reason.trim().slice(0, 500);
  if (!banReason) return { ok: false, error: "Say why, for the record." };
  const error = await call(async () =>
    auth.api.banUser({ body: { userId: customerId, banReason }, headers: await headers() }),
  );
  if (error) return { ok: false, error };
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, message: "Suspended. Their sessions have ended and nothing will be sent." };
}

export async function unsuspendAction(customerId: string): Promise<Result> {
  await requireSuperAdmin();
  const error = await call(async () =>
    auth.api.unbanUser({ body: { userId: customerId }, headers: await headers() }),
  );
  if (error) return { ok: false, error };
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, message: "No longer suspended." };
}

/** Logs in as the customer (for an hour), to see what they see. */
export async function impersonateAction(customerId: string): Promise<Result> {
  await requireSuperAdmin();
  const error = await call(async () =>
    auth.api.impersonateUser({ body: { userId: customerId }, headers: await headers() }),
  );
  if (error) return { ok: false, error };
  redirect("/");
}
