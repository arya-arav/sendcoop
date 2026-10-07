import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

/** Current session, or null. Cached per request so layouts and pages share one lookup. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Current session, or redirect to /login. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
