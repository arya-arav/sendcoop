import { isSuperAdmin } from "@sendcoop/db";
import { notFound } from "next/navigation";
import { requireSession } from "./session";

/** The signed-in super-admin (users.is_super_admin), or a 404 for everyone else. */
export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!(await isSuperAdmin(session.user.id))) notFound();
  return session;
}
