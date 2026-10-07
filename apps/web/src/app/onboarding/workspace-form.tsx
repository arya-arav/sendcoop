"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { createWorkspace } from "./actions";

export function WorkspaceForm({ suggestedName }: { suggestedName: string }) {
  const [state, action, pending] = useActionState(createWorkspace, { error: null });

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <Field
        label="Workspace name"
        name="name"
        required
        minLength={2}
        maxLength={60}
        defaultValue={suggestedName}
        placeholder="Acme Inc."
      />
      <SubmitButton pending={pending}>Create workspace</SubmitButton>
    </form>
  );
}
