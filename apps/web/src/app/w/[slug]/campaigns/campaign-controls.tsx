"use client";

import type { CampaignStatus } from "@sendcoop/db";
import { Pause, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
import { controlCampaignAction } from "./actions";

/** Pause, resume and cancel, for whatever the campaign's status allows. */
export function CampaignControls({
  slug,
  campaignId,
  name,
  status,
  size = "default",
}: {
  slug: string;
  campaignId: string;
  name: string;
  status: CampaignStatus;
  size?: "default" | "sm";
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(command: "pause" | "resume" | "cancel") {
    setError(null);
    startTransition(async () => {
      const result = await controlCampaignAction(slug, campaignId, command);
      if (!result.ok) setError(result.error);
      setConfirm(false);
      router.refresh();
    });
  }

  const canPause = status === "sending";
  const canResume = status === "paused";
  const canCancel = ["scheduled", "queued", "sending", "paused"].includes(status);
  if (!canPause && !canResume && !canCancel) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
      {canPause && (
        <Button
          variant="outline"
          size={size}
          disabled={pending}
          aria-label={`Pause ${name}`}
          onClick={() => run("pause")}
        >
          <Pause />
          Pause
        </Button>
      )}
      {canResume && (
        <Button
          size={size}
          disabled={pending}
          aria-label={`Resume ${name}`}
          onClick={() => run("resume")}
        >
          <Play />
          Resume
        </Button>
      )}
      {canCancel && (
        <Button
          variant="ghost"
          size={size}
          disabled={pending}
          aria-label={`Cancel ${name}`}
          onClick={() => setConfirm(true)}
        >
          <Square />
          Cancel
        </Button>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody else will get it. Emails already sent stay sent. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => run("cancel")}>
              {pending ? "Canceling…" : "Cancel campaign"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Refreshes the page every few seconds while something is happening. */
export function LiveRefresh({ active, everyMs = 3000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);
  return null;
}
