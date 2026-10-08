import { getOpenInvitation } from "@sendcoop/db";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { AcceptInvitationButton } from "./accept-button";

export const metadata: Metadata = { title: "Invitation" };

// Where an invitation email leads. Signed out: create an account or log in,
// coming back here. Signed in as the invited email: join.

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  const [invitation, session] = await Promise.all([getOpenInvitation(invitationId), getSession()]);

  if (!invitation) {
    return (
      <AuthCard title="This invitation can't be used">
        <p className="text-sm text-muted-foreground">
          It has expired, was canceled, or has already been accepted. Ask whoever invited you to
          send a new one.
        </p>
      </AuthCard>
    );
  }

  const next = encodeURIComponent(`/invite/${invitation.id}`);
  const title = `Join ${invitation.workspaceName}`;
  const subtitle = `${invitation.inviterName} invited ${invitation.email} to work with them on Sendcoop.`;

  if (!session) {
    return (
      <AuthCard title={title} subtitle={subtitle}>
        <div className="grid gap-2">
          <Link
            href={`/signup?next=${next}&email=${encodeURIComponent(invitation.email)}`}
            className={buttonVariants()}
          >
            Create an account
          </Link>
          <Link href={`/login?next=${next}`} className={buttonVariants({ variant: "outline" })}>
            Log in
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AuthCard title={title} subtitle={subtitle}>
        <p className="text-sm text-muted-foreground">
          You&apos;re logged in as {session.user.email}. Log in as {invitation.email} to accept it.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={title} subtitle={subtitle}>
      <AcceptInvitationButton invitationId={invitation.id} />
    </AuthCard>
  );
}
