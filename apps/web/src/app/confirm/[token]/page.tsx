import { getForm } from "@sendcoop/db";
import { CircleAlert, CircleCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readConfirmToken } from "@/lib/confirm-token";
import { ConfirmButton } from "./confirm-button";

// Opening the link doesn't confirm by itself: email security scanners open
// links automatically, so confirming takes a click on the button.
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claims = readConfirmToken(token);
  const form = claims ? await getForm(claims.workspaceId, claims.formId) : null;

  if (!claims) {
    return (
      <PublicShell>
        <Card>
          <CardHeader className="items-center text-center">
            <CircleAlert className="mx-auto size-8 text-destructive" aria-hidden="true" />
            <CardTitle>
              <h1 className="text-xl font-semibold tracking-tight">This link has expired</h1>
            </CardTitle>
            <CardDescription>
              Confirmation links work for 7 days. Sign up again to get a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <Card>
        <CardHeader className="items-center text-center">
          <CircleCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">Confirm your subscription</h1>
          </CardTitle>
          <CardDescription>One click and you&apos;re on the list.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmButton
            token={token}
            successMessage={form?.successMessage ?? "You're subscribed. Thanks!"}
          />
        </CardContent>
      </Card>
    </PublicShell>
  );
}
