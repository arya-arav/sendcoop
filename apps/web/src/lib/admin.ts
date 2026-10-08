import { isSuperAdmin } from "@sendcoop/db";
import { notFound } from "next/navigation";
import { requireSession } from "./session";

/** The signed-in super-admin (users.role "admin"), or a 404 for everyone else. */
export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!(await isSuperAdmin(session.user.id))) notFound();
  return session;
}
