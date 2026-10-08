"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { draftFlowAction } from "../ai-actions";

/** Describe the goal; Claude drafts the flow and its emails, as a draft to read over. */
export function AiFlowForm({ slug }: { slug: string }) {
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Draft a flow with AI</h2>
        </CardTitle>
        <CardDescription>
          Describe what it should achieve. You get a draft automation, emails written, to read over
          and adjust before it goes live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await draftFlowAction(slug, goal);
              if (result && !result.ok) setError(result.error);
            });
          }}
        >
          <Label htmlFor="ai-goal">Goal</Label>
          <Textarea
            id="ai-goal"
            rows={3}
            maxLength={2000}
            placeholder="e.g. Turn new webinar sign-ups into buyers of my $199 course"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" className="w-fit" disabled={pending}>
            <Sparkles />
            {pending ? "Drafting…" : "Draft the flow"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
