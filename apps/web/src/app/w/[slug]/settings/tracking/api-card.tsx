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
import { conversionApiCurl } from "@/lib/conversion-api-example";
import { rotateApiSecretAction } from "./actions";

/** The server-side conversion API: workspace id, secret and a working curl example. */
export function ApiCard({
  slug,
  trackingUrl,
  workspaceId,
  secret,
}: {
  slug: string;
  trackingUrl: string;
  workspaceId: string;
  /** null for members, who don't see it. */
  secret: string | null;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Conversion API</h2>
        </CardTitle>
        <CardDescription>
          Report sales, leads and refunds from your own server, signed with your API secret. See the{" "}
          <a
            href="https://github.com/arya-arav/sendcoop/blob/main/docs/conversion-api.md"
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            API docs
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <CopyField label="Workspace id" value={workspaceId} />
        {secret ? (
          <>
            <CopyField label="API secret" value={secret} />
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Try it</h3>
              <CopyField
                label="curl example"
                value={conversionApiCurl({ trackingUrl, workspaceId, secret })}
                multiline
              />
            </div>
            <FormError message={error} />
            <Button
              variant="outline"
              className="w-fit"
              disabled={pending}
              onClick={() => setConfirm(true)}
            >
              <RefreshCw />
              New secret
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only workspace owners and admins can see the API secret.
          </p>
        )}
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new API secret?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests signed with the old secret stop working. Update it on every server that uses
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the current secret</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await rotateApiSecretAction(slug);
                  if (!result.ok) setError(result.error);
                  setConfirm(false);
                })
              }
            >
              Make a new secret
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
