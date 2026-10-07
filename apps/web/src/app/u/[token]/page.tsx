import { getUnsubscribeTarget, readUnsubscribeToken } from "@sendcoop/db";
import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UnsubscribeCard } from "./unsubscribe-card";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

// Reached from the link in a campaign email. Opening it doesn't unsubscribe:
// email security scanners open links automatically, so it takes a click.
// (Mail apps' own Unsubscribe buttons use the one-click endpoint instead.)
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const messageId = readUnsubscribeToken(token);
  const target = messageId ? await getUnsubscribeTarget(messageId) : null;

  if (!target) {
    return (
      <PublicShell>
        <Card>
          <CardHeader className="items-center text-center">
            <CircleAlert className="mx-auto size-8 text-destructive" aria-hidden="true" />
            <CardTitle>
              <h1 className="text-xl font-semibold tracking-tight">This link doesn&apos;t work</h1>
            </CardTitle>
            <CardDescription>
              It may have been copied incompletely. Use the unsubscribe link in the latest email you
              received.
            </CardDescription>
          </CardHeader>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <UnsubscribeCard
        token={token}
        email={target.email}
        workspaceName={target.workspaceName}
        // Already off the list (unsubscribed, bounced, or deleted).
        initiallyUnsubscribed={target.status !== "subscribed" && target.status !== "pending"}
        // Bounced and complained addresses can't be brought back from here.
        canResubscribe={
          target.status !== null && !["bounced", "complained"].includes(target.status)
        }
      />
    </PublicShell>
  );
}
