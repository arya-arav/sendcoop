"use client";

import { WEBHOOK_EVENTS, type WebhookEvent } from "@sendcoop/db/webhook-events";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addWebhookEndpointAction,
  deleteWebhookEndpointAction,
  setWebhookEndpointEnabledAction,
  testWebhookEndpointAction,
} from "./actions";

export const EVENT_LABELS: Record<WebhookEvent, string> = {
  "subscriber.subscribed": "Someone subscribed",
  "subscriber.unsubscribed": "Someone unsubscribed",
  "email.clicked": "A link in an email was clicked",
  "conversion.created": "A sale or lead was recorded",
};

export function AddEndpointForm({ slug }: { slug: string }) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addWebhookEndpointAction(slug, { url, description, events });
          if (!result.ok) setError(result.error);
          else {
            setUrl("");
            setDescription("");
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="endpoint-url">Endpoint URL</Label>
          <Input
            id="endpoint-url"
            placeholder="https://example.com/sendcoop"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="endpoint-description">Description (optional)</Label>
          <Input
            id="endpoint-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Events</legend>
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={events.includes(event)}
              onChange={(e) =>
                setEvents(e.target.checked ? [...events, event] : events.filter((x) => x !== event))
              }
            />
            {EVENT_LABELS[event]} <code className="text-xs text-muted-foreground">{event}</code>
          </label>
        ))}
      </fieldset>
      <FormError message={error} />
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Adding…" : "Add endpoint"}
      </Button>
    </form>
  );
}

export function EndpointControls({
  slug,
  endpointId,
  url,
  enabled,
}: {
  slug: string;
  endpointId: string;
  url: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? (result.message ?? null) : (result.error ?? null));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !enabled}
        aria-label={`Send a test to ${url}`}
        onClick={() => run(() => testWebhookEndpointAction(slug, endpointId))}
      >
        Send test
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => setWebhookEndpointEnabledAction(slug, endpointId, !enabled))}
      >
        {enabled ? "Turn off" : "Turn on"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Delete ${url}`}
        onClick={() => {
          if (confirm("Delete this endpoint? Nothing more is sent to it.")) {
            run(() => deleteWebhookEndpointAction(slug, endpointId));
          }
        }}
      >
        Delete
      </Button>
      {message && (
        <p role="status" className="w-full text-right text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
