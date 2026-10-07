"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { confirmSubscriptionAction } from "./actions";

export function ConfirmButton({
  token,
  successMessage,
}: {
  token: string;
  successMessage: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"done" | "failed" | null>(null);

  if (result === "done") {
    return (
      <p role="status" className="text-center font-medium">
        {successMessage}
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <FormError message={result === "failed" ? "We couldn't confirm this subscription." : null} />
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await confirmSubscriptionAction(token);
            setResult(outcome.ok ? "done" : "failed");
          })
        }
      >
        {pending ? "Confirming…" : "Confirm subscription"}
      </Button>
    </div>
  );
}
