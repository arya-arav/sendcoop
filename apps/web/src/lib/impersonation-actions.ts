"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Ends a super-admin's "log in as" session, back to their own (D75). */
export async function stopImpersonatingAction() {
  await auth.api.stopImpersonating({ headers: await headers() });
  redirect("/admin/customers");
}
