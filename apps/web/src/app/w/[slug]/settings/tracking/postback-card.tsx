"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { CopyField } from "@/components/copy-field";
import { FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { rotatePostbackKeyAction, savePostbackIpsAction } from "./actions";
import { type NetworkPostback, NetworkPostbacks } from "./network-postbacks";

/** Where affiliate networks report sales: the postback URL and its key. */
export function PostbackCard({
  slug,
  editable,
  postbackUrl,
  allowedIps,
  networks,
  trackingUrl,
  postbackKey,
}: {
  slug: string;
  editable: boolean;
  postbackUrl: string;
  allowedIps: string[];
  networks: NetworkPostback[];
  trackingUrl: string;
  /** null for members, who don't see the key. */
  postbackKey: string | null;
}) {
  const [ips, setIps] = useState(allowedIps.join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  function saveIps() {
    setError(null);
    startTransition(async () => {
      const result = await savePostbackIpsAction(slug, ips);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIps(result.ips.join("\n"));
      setMessage(result.ips.length === 0 ? "Saved. Any IP may send postbacks." : "Saved.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Conversion postback</h2>
        </CardTitle>
        <CardDescription>
          Paste this into your affiliate network as the postback (or &quot;S2S pixel&quot;) URL,
          with its own macros for the sub-id, payout and transaction id. Sales then show up in your
          reports, attributed to the email that led to them. Sent twice, a sale counts once.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <CopyField label="Postback URL" value={postbackUrl} />
        <p className="text-xs text-muted-foreground">
          Replace {"{subid}"}, {"{payout}"} and {"{txid}"} with your network&apos;s macros. Also
          understood: status (approved, pending, rejected, refund), currency and event (sale, lead).
        </p>

        {postbackKey && (
          <div className="grid gap-3 border-t pt-5">
            <h3 className="text-sm font-medium">Ready-made for your network</h3>
            <NetworkPostbacks
              networks={networks}
              trackingUrl={trackingUrl}
              postbackKey={postbackKey}
            />
          </div>
        )}

        {editable && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="postback-ips">Only accept postbacks from these IPs (optional)</Label>
              <Textarea
                id="postback-ips"
                rows={3}
                value={ips}
                placeholder={"203.0.113.10\n198.51.100.0/24"}
                onChange={(e) => {
                  setIps(e.target.value);
                  setMessage(null);
                }}
              />
            </div>
            <FormError message={error} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" disabled={pending} onClick={() => setConfirm(true)}>
                <RefreshCw />
                New key
              </Button>
              <div className="flex items-center gap-3">
                {message && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {message}
                  </p>
                )}
                <Button disabled={pending} onClick={saveIps}>
                  {pending ? "Saving…" : "Save IPs"}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new postback key?</AlertDialogTitle>
            <AlertDialogDescription>
              Postbacks with the old URL stop counting. Update the URL in every network that uses
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the current key</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await rotatePostbackKeyAction(slug);
                  if (!result.ok) setError(result.error);
                  setConfirm(false);
                })
              }
            >
              Make a new key
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
