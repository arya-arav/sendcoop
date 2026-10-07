import { getPublicForm } from "@sendcoop/db";
import { MailCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ confirm?: string }>;
}) {
  const found = await getPublicForm((await params).publicId);
  if (!found) notFound();
  const needsConfirmation = (await searchParams).confirm === "1";

  return (
    <PublicShell>
      <Card>
        <CardHeader className="items-center text-center">
          <MailCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">
              {needsConfirmation ? "Check your inbox" : "You're subscribed"}
            </h1>
          </CardTitle>
          <CardDescription>
            {needsConfirmation
              ? `We sent you an email from ${found.workspaceName}. Click the link in it to confirm your subscription.`
              : found.form.successMessage}
          </CardDescription>
        </CardHeader>
      </Card>
    </PublicShell>
  );
}
