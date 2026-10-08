"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitationButton({ invitationId }: { invitationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      <FormError message={error} />
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitationAction(invitationId);
            if (result) setError(result.error);
          })
        }
      >
        {pending ? "Joining…" : "Join the workspace"}
      </Button>
    </div>
  );
}
