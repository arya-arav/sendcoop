"use server";

import { getWorkspacePlan, teamSeatsUsed } from "@sendcoop/db";
import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

// Team actions go through Better Auth's organization API, which checks the
// caller's role again (only owners and admins invite, change roles and
// remove people; nobody but the owner touches the owner).

type Result = { ok: true; message?: string } | { ok: false; error: string };

const NO_PERMISSION = "Only owners and admins can manage the team.";
const roleSchema = z.enum(["admin", "member"]);

async function managerWorkspace(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  return canManage(role) ? workspace : null;
}

async function call(action: () => Promise<unknown>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (error) {
    if (error instanceof APIError) return error.body?.message ?? error.message;
    throw error;
  }
}

export async function inviteMemberAction(
  slug: string,
  input: { email: string; role: string },
): Promise<Result> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  const email = z.email().safeParse(input.email.trim().toLowerCase());
  if (!email.success) return { ok: false, error: "Enter a valid email address." };
  const role = roleSchema.safeParse(input.role);
  if (!role.success) return { ok: false, error: "Choose a role." };

  const plan = await getWorkspacePlan(workspace.id);
  const limit = plan.limits.teamMembers;
  if (limit !== null && (await teamSeatsUsed(workspace.id)) >= limit) {
    return {
      ok: false,
      error: `Your ${plan.plan.name} plan allows ${limit} ${limit === 1 ? "person" : "people"} per workspace, invitations included. Upgrade the plan to add more.`,
    };
  }
  const error = await call(async () =>
    auth.api.createInvitation({
      body: { email: email.data, role: role.data, organizationId: workspace.id, resend: true },
      headers: await headers(),
    }),
  );
  if (error) return { ok: false, error };
  revalidatePath(`/w/${slug}/settings/team`);
  return { ok: true, message: `Invitation sent to ${email.data}.` };
}

export async function cancelInvitationAction(slug: string, invitationId: string): Promise<Result> {
  if (!(await managerWorkspace(slug))) return { ok: false, error: NO_PERMISSION };
  const error = await call(async () =>
    auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() }),
  );
  if (error) return { ok: false, error };
  revalidatePath(`/w/${slug}/settings/team`);
  return { ok: true };
}

export async function changeRoleAction(
  slug: string,
  memberId: string,
  role: string,
): Promise<Result> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, error: "Choose a role." };
  const error = await call(async () =>
    auth.api.updateMemberRole({
      body: { memberId, role: parsed.data, organizationId: workspace.id },
      headers: await headers(),
    }),
  );
  if (error) return { ok: false, error };
  revalidatePath(`/w/${slug}/settings/team`);
  return { ok: true };
}

export async function removeMemberAction(slug: string, memberId: string): Promise<Result> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  const error = await call(async () =>
    auth.api.removeMember({
      body: { memberIdOrEmail: memberId, organizationId: workspace.id },
      headers: await headers(),
    }),
  );
  if (error) return { ok: false, error };
  revalidatePath(`/w/${slug}/settings/team`);
  return { ok: true };
}
