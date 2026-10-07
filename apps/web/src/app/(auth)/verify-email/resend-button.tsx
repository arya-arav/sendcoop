"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ResendButton({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resend() {
    setStatus("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/" });
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="space-y-3 text-sm">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={resend}
        disabled={status === "sending"}
      >
        {status === "sending" ? "Sending…" : "Resend the email"}
      </Button>
      {status === "sent" && <p className="text-muted-foreground">Sent. Check your inbox again.</p>}
      {status === "error" && (
        <p className="text-destructive">Couldn&apos;t resend. Try again in a minute.</p>
      )}
    </div>
  );
}
