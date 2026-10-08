"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveAffiliateDomainsAction } from "./actions";

export function AffiliateDomainsForm({
  slug,
  editable,
  initial,
}: {
  slug: string;
  editable: boolean;
  initial: string[];
}) {
  const [text, setText] = useState(initial.join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveAffiliateDomainsAction(slug, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText(result.domains.join("\n"));
      setMessage(
        result.domains.length === 0
          ? "Saved. No extra affiliate domains."
          : `Saved ${result.domains.length} ${result.domains.length === 1 ? "domain" : "domains"}.`,
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Your affiliate domains</h2>
        </CardTitle>
        <CardDescription>
          Links to these domains (and their subdomains) also count as affiliate links: for example
          your own tracking domain, or a network not listed above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3">
          <Label htmlFor="affiliate-domains" className="sr-only">
            Affiliate domains
          </Label>
          <Textarea
            id="affiliate-domains"
            rows={6}
            value={text}
            disabled={!editable}
            placeholder={"track.mysite.com\npartner-network.com"}
            onChange={(e) => {
              setText(e.target.value);
              setMessage(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            One per line. Applies to campaigns sent from now on.
          </p>
          <FormError message={error} />
          {editable && (
            <div className="flex items-center justify-end gap-3">
              {message && (
                <p role="status" className="text-sm text-muted-foreground">
                  {message}
                </p>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save domains"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
