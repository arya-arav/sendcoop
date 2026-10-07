"use client";

import { useState } from "react";
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
      <button
        type="button"
        onClick={resend}
        disabled={status === "sending"}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {status === "sending" ? "Sending…" : "Resend the email"}
      </button>
      {status === "sent" && (
        <p className="text-zinc-600 dark:text-zinc-400">Sent. Check your inbox again.</p>
      )}
      {status === "error" && (
        <p className="text-red-600">Couldn&apos;t resend. Try again in a minute.</p>
      )}
    </div>
  );
}
