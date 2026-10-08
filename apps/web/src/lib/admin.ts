import { isSuperAdmin, recordAdminActivity } from "@sendcoop/db";
import { notFound } from "next/navigation";
import { requireSession } from "./session";

/** The signed-in super-admin (users.role "admin"), or a 404 for everyone else. */
export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!(await isSuperAdmin(session.user.id))) notFound();
  return session;
}

/** Records what the signed-in super-admin just did, for the activity log. */
export async function logAdminAction(
  action: string,
  targetId: string | null,
  detail: Record<string, unknown> = {},
) {
  const session = await requireSuperAdmin();
  await recordAdminActivity({ adminId: session.user.id, action, targetId, detail });
}
