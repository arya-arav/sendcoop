"use client";

import { CalendarClock, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { launchCampaignAction } from "../../../actions";

type When = "now" | "later" | "subscriber";

const CHOICES: { value: When; label: string; hint: string }[] = [
  { value: "now", label: "Send now", hint: "Starts within a few seconds." },
  { value: "later", label: "Schedule", hint: "At one moment, for everyone." },
  {
    value: "subscriber",
    label: "Schedule in each subscriber's timezone",
    hint: "Everyone gets it at that local time. People without a known timezone get it in the timezone below.",
  },
];

/** "YYYY-MM-DDTHH:mm" an hour from now, in the browser's time. */
function inAnHour() {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export function ScheduleForm({
  slug,
  campaignId,
  ready,
  recipients,
  timezones,
}: {
  slug: string;
  campaignId: string;
  ready: boolean;
  recipients: number;
  timezones: string[];
}) {
  const [when, setWhen] = useState<When>("now");
  const [local, setLocal] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(value: When) {
    setWhen(value);
    // First time a schedule is chosen: the browser's timezone, an hour from now.
    if (value !== "now" && !local) {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      setLocal(inAnHour());
    }
  }

  function launch(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await launchCampaignAction(
        slug,
        campaignId,
        when === "now" ? { when } : { when, local, timezone },
      );
      if (result?.error) setError(result.error);
    });
  }

  const people = `${recipients.toLocaleString("en")} ${recipients === 1 ? "recipient" : "recipients"}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>When</h2>
        </CardTitle>
        <CardDescription>Goes to {people}.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={launch} className="grid gap-5">
          <div role="radiogroup" aria-label="When" className="grid gap-3">
            {CHOICES.map((choice) => (
              <div key={choice.value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="when"
                  id={`when-${choice.value}`}
                  className="mt-1 size-4 accent-foreground"
                  checked={when === choice.value}
                  onChange={() => choose(choice.value)}
                  aria-describedby={`when-${choice.value}-hint`}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor={`when-${choice.value}`}>{choice.label}</Label>
                  <span id={`when-${choice.value}-hint`} className="text-xs text-muted-foreground">
                    {choice.hint}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {when !== "now" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="send-at">
                  {when === "subscriber" ? "Local date and time" : "Date and time"}
                </Label>
                <Input
                  id="send-at"
                  type="datetime-local"
                  required
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <NativeSelect
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replaceAll("_", " ")}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}

          <FormError message={error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={!ready || pending}>
              {when === "now" ? <Send /> : <CalendarClock />}
              {pending ? "Working…" : when === "now" ? `Send to ${people}` : "Schedule"}
            </Button>
          </div>
          {!ready && (
            <p className="text-right text-xs text-muted-foreground">Finish the checklist first.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
