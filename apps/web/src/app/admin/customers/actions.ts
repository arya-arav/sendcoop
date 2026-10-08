"use server";

import {
  deleteWorkspaces,
  getCustomer,
  getPlan,
  isWorkspaceSlugTaken,
  LIMIT_LABELS,
  type PlanLimits,
  setAccountOverrides,
  setAccountPlan,
  soleOwnedWorkspaces,
} from "@sendcoop/db";
import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAdminAction, requireSuperAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { slugCandidate, slugify } from "@/lib/slug";

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
  await logAdminAction("customer.plan", customerId, { plan: plan.key });
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
  await logAdminAction("customer.overrides", customerId, { limits, trusted });
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
  await logAdminAction("customer.suspended", customerId, { reason: banReason });
  return { ok: true, message: "Suspended. Their sessions have ended and nothing will be sent." };
}

export async function unsuspendAction(customerId: string): Promise<Result> {
  await requireSuperAdmin();
  const error = await call(async () =>
    auth.api.unbanUser({ body: { userId: customerId }, headers: await headers() }),
  );
  if (error) return { ok: false, error };
  revalidatePath(`/admin/customers/${customerId}`);
  await logAdminAction("customer.unsuspended", customerId);
  return { ok: true, message: "No longer suspended." };
}

/** Logs in as the customer (for an hour), to see what they see. */
export async function impersonateAction(customerId: string): Promise<Result> {
  await requireSuperAdmin();
  // Before switching: afterwards the session is theirs.
  await logAdminAction("customer.impersonated", customerId);
  const error = await call(async () =>
    auth.api.impersonateUser({ body: { userId: customerId }, headers: await headers() }),
  );
  if (error) return { ok: false, error };
  redirect("/");
}

const newCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(100),
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(8, "Use at least 8 characters for the password.").max(200),
  workspace: z.string().trim().max(60),
  planId: z.string(),
});

/**
 * Adds an account by hand (D75+): verified straight away, with its first
 * workspace and plan, as when a customer is set up on their behalf.
 */
export async function createCustomerAction(
  input: z.input<typeof newCustomerSchema>,
): Promise<Result & { id?: string }> {
  await requireSuperAdmin();
  const parsed = newCustomerSchema.safeParse({ ...input, email: input.email.trim().toLowerCase() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { name, email, password, workspace, planId } = parsed.data;
  let userId = "";
  const error = await call(async () => {
    const created = await auth.api.createUser({
      body: { email, password, name, role: "user", data: { emailVerified: true } },
      headers: await headers(),
    });
    userId = created.user.id;
  });
  if (error) return { ok: false, error };
  if (workspace) {
    const slug = await availableSlug(workspace);
    if (slug) {
      // No session: Better Auth creates it for userId as a system action.
      await auth.api.createOrganization({ body: { name: workspace, slug, userId } });
    }
  }
  const plan = planId ? await getPlan(planId) : null;
  if (plan && plan.key !== "free") await setAccountPlan(userId, plan.id, { status: "active" });
  await logAdminAction("customer.created", userId, { email, plan: plan?.key ?? "free" });
  revalidatePath("/admin/customers");
  return { ok: true, id: userId, message: "Customer added." };
}

async function availableSlug(name: string) {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = slugCandidate(base, attempt);
    if (!(await isWorkspaceSlugTaken(slug))) return slug;
  }
  return null;
}

/** Deletes an account, and the workspaces only it owns. Typing their email confirms. */
export async function deleteCustomerAction(
  customerId: string,
  confirmEmail: string,
): Promise<Result> {
  await requireSuperAdmin();
  const customer = await getCustomer(customerId);
  if (!customer) return { ok: false, error: "No such customer." };
  if (customer.role === "admin") return { ok: false, error: "Admins can't be deleted here." };
  if (confirmEmail.trim().toLowerCase() !== customer.email.toLowerCase()) {
    return { ok: false, error: "Type the customer's email to confirm." };
  }
  const owned = await soleOwnedWorkspaces(customerId);
  await deleteWorkspaces(owned.map((w) => w.id));
  const error = await call(async () =>
    auth.api.removeUser({ body: { userId: customerId }, headers: await headers() }),
  );
  if (error) return { ok: false, error };
  await logAdminAction("customer.deleted", customerId, {
    email: customer.email,
    workspaces: owned.map((w) => w.name),
  });
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(100),
  email: z.email({ error: "Enter a valid email address." }),
  emailVerified: z.boolean(),
});

export async function updateCustomerProfileAction(
  customerId: string,
  input: z.input<typeof profileSchema>,
): Promise<Result> {
  await requireSuperAdmin();
  const parsed = profileSchema.safeParse({ ...input, email: input.email.trim().toLowerCase() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const error = await call(async () =>
    auth.api.adminUpdateUser({
      body: { userId: customerId, data: parsed.data },
      headers: await headers(),
    }),
  );
  if (error) return { ok: false, error };
  await logAdminAction("customer.profile", customerId, parsed.data);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, message: "Profile saved." };
}

export async function setCustomerPasswordAction(
  customerId: string,
  password: string,
): Promise<Result> {
  await requireSuperAdmin();
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  const error = await call(async () =>
    auth.api.setUserPassword({
      body: { userId: customerId, newPassword: password },
      headers: await headers(),
    }),
  );
  if (error) return { ok: false, error };
  await logAdminAction("customer.password", customerId, {});
  return { ok: true, message: "Password changed. Tell them the new one securely." };
}

/** Bulk actions from the customer list. */
export async function bulkCustomersAction(
  ids: string[],
  action:
    { kind: "suspend"; reason: string } | { kind: "unsuspend" } | { kind: "plan"; planId: string },
): Promise<Result> {
  await requireSuperAdmin();
  const valid = ids.filter((id) => userId.safeParse(id).success).slice(0, 200);
  if (valid.length === 0) return { ok: false, error: "Choose customers first." };
  let done = 0;
  const problems: string[] = [];
  for (const id of valid) {
    const result =
      action.kind === "suspend"
        ? await suspendAction(id, action.reason)
        : action.kind === "unsuspend"
          ? await unsuspendAction(id)
          : await changePlanAction(id, action.planId);
    if (result.ok) done++;
    else problems.push(result.error);
  }
  revalidatePath("/admin/customers");
  return problems.length === 0
    ? { ok: true, message: `Done for ${done} ${done === 1 ? "customer" : "customers"}.` }
    : { ok: false, error: `Done for ${done}; ${problems.length} failed: ${problems[0]}` };
}
