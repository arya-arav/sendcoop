"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

export function NewApiKeyForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createApiKeyAction(slug, name);
            if (!result.ok) setError(result.error);
            else {
              setKey(result.key);
              setName("");
            }
          });
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="key-name">Key name</Label>
          <Input
            id="key-name"
            placeholder="e.g. Checkout server"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>
      <FormError message={error} />
      {key && (
        <div className="grid gap-1 rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
          <Label htmlFor="new-key">Your new key</Label>
          <Input
            id="new-key"
            readOnly
            value={key}
            className="font-mono"
            onFocus={(e) => e.target.select()}
          />
          <p className="text-muted-foreground">
            Copy it now: it won&apos;t be shown again. Anyone with it can change this
            workspace&apos;s subscribers, so keep it on your server.
          </p>
        </div>
      )}
    </div>
  );
}

export function RevokeApiKeyButton({
  slug,
  keyId,
  name,
}: {
  slug: string;
  keyId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Revoke ${name}`}
      onClick={() => {
        if (confirm(`Revoke "${name}"? Anything using it stops working.`)) {
          startTransition(async () => void (await revokeApiKeyAction(slug, keyId)));
        }
      }}
    >
      Revoke
    </Button>
  );
}
