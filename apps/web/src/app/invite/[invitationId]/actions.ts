"use server";

import { getOpenInvitation } from "@sendcoop/db";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/session";

/** Joins the invitation's workspace (Better Auth checks it's for this user's email). */
export async function acceptInvitationAction(invitationId: string) {
  await requireSession();
  const invitation = await getOpenInvitation(invitationId);
  if (!invitation) return { error: "This invitation can't be used any more." };
  try {
    await auth.api.acceptInvitation({ body: { invitationId }, headers: await headers() });
  } catch (error) {
    if (error instanceof APIError) return { error: error.body?.message ?? error.message };
    throw error;
  }
  redirect(`/w/${invitation.workspaceSlug}`);
}
