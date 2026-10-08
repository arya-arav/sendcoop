"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  cancelInvitationAction,
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
} from "./actions";

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member (view only)",
};

/** Invites someone by email, as an admin or a view-only member. */
export function InviteForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSent(null);
        startTransition(async () => {
          const result = await inviteMemberAction(slug, { email, role });
          if (!result.ok) setError(result.error);
          else {
            setSent(result.message ?? null);
            setEmail("");
          }
        });
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="invite-role">Role</Label>
        <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>
          <NativeSelectOption value="member">{ROLE_LABELS.member}</NativeSelectOption>
          <NativeSelectOption value="admin">{ROLE_LABELS.admin}</NativeSelectOption>
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invitation"}
      </Button>
      <div className="sm:col-span-3">
        <FormError message={error} />
        {sent && (
          <p role="status" className="text-sm text-muted-foreground">
            {sent}
          </p>
        )}
      </div>
    </form>
  );
}

/** A member's role (owners can't be changed here) and removing them. */
export function MemberControls({
  slug,
  memberId,
  name,
  role,
}: {
  slug: string;
  memberId: string;
  name: string;
  role: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <NativeSelect
        size="sm"
        aria-label={`Role for ${name}`}
        value={role}
        disabled={pending}
        onChange={(e) => run(() => changeRoleAction(slug, memberId, e.target.value))}
      >
        <NativeSelectOption value="admin">{ROLE_LABELS.admin}</NativeSelectOption>
        <NativeSelectOption value="member">{ROLE_LABELS.member}</NativeSelectOption>
      </NativeSelect>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${name}`}
        onClick={() => {
          if (confirm(`Remove ${name} from this workspace?`)) {
            run(() => removeMemberAction(slug, memberId));
          }
        }}
      >
        Remove
      </Button>
      {error && (
        <p role="alert" className="w-full text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function CancelInvitationButton({
  slug,
  invitationId,
  email,
}: {
  slug: string;
  invitationId: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Cancel the invitation to ${email}`}
      onClick={() =>
        startTransition(async () => void (await cancelInvitationAction(slug, invitationId)))
      }
    >
      Cancel
    </Button>
  );
}
