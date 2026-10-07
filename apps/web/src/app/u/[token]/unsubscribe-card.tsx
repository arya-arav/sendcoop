"use client";

import { CircleCheck, MailX } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resubscribeAction, unsubscribeAction } from "./actions";

export function UnsubscribeCard({
  token,
  email,
  workspaceName,
  initiallyUnsubscribed,
  canResubscribe,
}: {
  token: string;
  email: string;
  workspaceName: string;
  initiallyUnsubscribed: boolean;
  canResubscribe: boolean;
}) {
  const [unsubscribed, setUnsubscribed] = useState(initiallyUnsubscribed);
  const [resubscribed, setResubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: typeof unsubscribeAction, onDone: () => void) {
    setError(null);
    startTransition(async () => {
      const { ok } = await action(token);
      if (ok) onDone();
      else setError("Something went wrong. Please try again.");
    });
  }

  if (!unsubscribed) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailX className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">
              {resubscribed ? "You're subscribed again" : `Unsubscribe from ${workspaceName}?`}
            </h1>
          </CardTitle>
          <CardDescription role={resubscribed ? "status" : undefined}>
            {resubscribed
              ? `${email} will keep getting emails from ${workspaceName}.`
              : `${email} will stop getting emails from ${workspaceName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <FormError message={error} />
          <Button
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(unsubscribeAction, () => {
                setResubscribed(false);
                setUnsubscribed(true);
              })
            }
          >
            {pending ? "Unsubscribing…" : "Unsubscribe"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CircleCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">You&apos;re unsubscribed</h1>
        </CardTitle>
        <CardDescription role="status">
          {email} won&apos;t get any more emails from {workspaceName}.
        </CardDescription>
      </CardHeader>
      {canResubscribe && (
        <CardContent className="grid gap-3">
          <FormError message={error} />
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(resubscribeAction, () => {
                setResubscribed(true);
                setUnsubscribed(false);
              })
            }
          >
            {pending ? "Resubscribing…" : "Unsubscribed by mistake? Resubscribe"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
