"use client";

import { useState, useTransition } from "react";
import { CopyField } from "@/components/copy-field";
import { FormError } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveShopifySecretAction } from "./actions";

/** Shopify orders and refunds by webhook: the URL to add, and Shopify's signing secret. */
export function ShopifyCard({
  slug,
  webhookUrl,
  connected,
}: {
  slug: string;
  /** null for members. */
  webhookUrl: string | null;
  /** Whether the signing secret has been saved. */
  connected: boolean;
}) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <h2>Shopify</h2>
          {connected && <Badge variant="secondary">Connected</Badge>}
        </CardTitle>
        <CardDescription>
          Orders and refunds from your Shopify store, credited to the email that led to them.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {webhookUrl ? (
          <>
            <ol className="grid list-decimal gap-2 pl-5 text-sm">
              <li>
                Add the website pixel above to your theme (theme.liquid, in the &lt;head&gt;).
              </li>
              <li>
                In Shopify: Settings &gt; Notifications &gt; Webhooks, create two webhooks in JSON
                with this URL: <strong>Order creation</strong> and <strong>Refund create</strong>.
              </li>
              <li>Paste the secret Shopify shows below the webhooks (&quot;signed with&quot;).</li>
            </ol>
            <CopyField label="Shopify webhook URL" value={webhookUrl} />
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await saveShopifySecretAction(slug, secret);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setSecret("");
                  setMessage("Saved. New orders will show up in recent conversions.");
                });
              }}
            >
              <Label htmlFor="shopify-secret">Webhook signing secret</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="shopify-secret"
                  className="max-w-md font-mono text-xs"
                  autoComplete="off"
                  value={secret}
                  placeholder={connected ? "Saved: paste a new one to replace it" : ""}
                  onChange={(e) => {
                    setSecret(e.target.value);
                    setMessage(null);
                  }}
                />
                <Button type="submit" disabled={pending || !secret.trim()}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
              <FormError message={error} />
              {message && (
                <p role="status" className="text-sm text-muted-foreground">
                  {message}
                </p>
              )}
            </form>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only workspace owners and admins can connect Shopify.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
