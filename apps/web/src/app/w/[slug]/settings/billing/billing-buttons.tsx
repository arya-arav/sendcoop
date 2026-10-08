"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { choosePlanAction, openPortalAction } from "./actions";

type Result = Awaited<ReturnType<typeof choosePlanAction>>;

function useBillingAction() {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessage({ text: result.error, error: true });
      else if (result.url) window.location.assign(result.url);
      else if (result.message) setMessage({ text: result.message, error: false });
    });
  };
  return { message, pending, run };
}

function Message({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  return (
    <p
      role={message.error ? "alert" : "status"}
      className={message.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
    >
      {message.text}
    </p>
  );
}

/** Subscribes to a plan (through Checkout), or switches to it when already paying. */
export function ChoosePlanButton({
  slug,
  planId,
  planName,
  paying,
}: {
  slug: string;
  planId: string;
  planName: string;
  paying: boolean;
}) {
  const { message, pending, run } = useBillingAction();
  return (
    <div className="grid justify-items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`${paying ? "Switch to" : "Choose"} ${planName}`}
        onClick={() => run(() => choosePlanAction(slug, planId))}
      >
        {pending ? "One moment…" : paying ? "Switch" : "Choose"}
      </Button>
      <Message message={message} />
    </div>
  );
}

/** Stripe's customer portal: card, invoices, cancelling. */
export function ManageBillingButton({ slug }: { slug: string }) {
  const { message, pending, run } = useBillingAction();
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        className="w-fit"
        disabled={pending}
        onClick={() => run(() => openPortalAction(slug))}
      >
        {pending ? "Opening…" : "Manage billing"}
      </Button>
      <Message message={message} />
    </div>
  );
}
