"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectUtmcapAction, disconnectUtmcapAction } from "./actions";
import { Reconcile } from "./reconcile";

/** Connect UTMCAP with an API key: Sendcoop sets up its traffic source and webhook there. */
export function UtmcapCard({
  slug,
  editable,
  connection,
}: {
  slug: string;
  editable: boolean;
  connection: { sourceName: string; sourceId: string; connectedAt: string } | null;
}) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <h2>UTMCAP</h2>
          {connection && <Badge variant="secondary">Connected</Badge>}
        </CardTitle>
        <CardDescription>
          Send email clicks through your UTMCAP campaigns. Sendcoop becomes a traffic source in
          UTMCAP, and every conversion UTMCAP records on those clicks comes back here, credited to
          the email, with status changes and chargebacks.{" "}
          <a
            href="https://github.com/arya-arav/sendcoop/blob/main/docs/utmcap.md"
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            How it works
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
        {connection ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Traffic source</dt>
              <dd>
                {connection.sourceName}{" "}
                <span className="text-xs text-muted-foreground">({connection.sourceId})</span>
              </dd>
              <dt className="text-muted-foreground">Webhook</dt>
              <dd>Conversion created and updated</dd>
              <dt className="text-muted-foreground">Connected</dt>
              <dd suppressHydrationWarning>{new Date(connection.connectedAt).toLocaleString()}</dd>
            </dl>
            <Reconcile slug={slug} />
            {editable && (
              <Button
                variant="outline"
                className="w-fit"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await disconnectUtmcapAction(slug);
                    if (!result.ok) setError(result.error);
                    else
                      setMessage(
                        "Disconnected. Remove the Sendcoop source and webhook in UTMCAP if you no longer need them.",
                      );
                  })
                }
              >
                Disconnect
              </Button>
            )}
          </>
        ) : editable ? (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setMessage(null);
              startTransition(async () => {
                const result = await connectUtmcapAction(slug, apiKey);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setApiKey("");
                setMessage(`Connected. “${result.sourceName}” is now a traffic source in UTMCAP.`);
              });
            }}
          >
            <Label htmlFor="utmcap-key">UTMCAP API key</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="utmcap-key"
                className="max-w-md font-mono text-xs"
                autoComplete="off"
                placeholder="utmk_…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button type="submit" disabled={pending || !apiKey.trim()}>
                {pending ? "Connecting…" : "Connect"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              In UTMCAP: Settings → API → New key (with write access). It&apos;s stored encrypted.
            </p>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only workspace owners and admins can connect UTMCAP.
          </p>
        )}
        <FormError message={error} />
      </CardContent>
    </Card>
  );
}
