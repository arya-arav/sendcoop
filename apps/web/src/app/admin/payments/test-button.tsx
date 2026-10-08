"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { testStripeAction } from "./actions";

export function TestStripeButton() {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await testStripeAction();
            setMessage(
              result.ok
                ? { text: result.message, error: false }
                : { text: result.error, error: true },
            );
          })
        }
      >
        {pending ? "Testing…" : "Test connection"}
      </Button>
      {message && (
        <span
          role={message.error ? "alert" : "status"}
          className={message.error ? "text-destructive" : "text-muted-foreground"}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
