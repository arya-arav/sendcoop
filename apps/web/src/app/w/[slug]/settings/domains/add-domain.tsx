"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDomainAction } from "./actions";

export function AddDomainForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = String(new FormData(event.currentTarget).get("domain") ?? "");
    startTransition(async () => {
      const result = await addDomainAction(slug, domain);
      if (result.ok) router.push(`/w/${slug}/settings/domains/${result.id}`);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <Label htmlFor="domain">Domain you send from</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="domain"
          name="domain"
          placeholder="mail.acme.com"
          required
          maxLength={253}
          className="max-w-sm"
          onChange={() => setError(null)}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add domain"}
        </Button>
      </div>
      <FormError message={error} />
      <p className="text-sm text-muted-foreground">
        Tip: use a subdomain like mail.acme.com for marketing email, so your main domain&apos;s
        reputation stays separate.
      </p>
    </form>
  );
}
