"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { draftEmailAction, suggestSubjectsAction } from "../../ai-actions";

export type AiDraft = { subject: string; html: string; text: string };

/** "Write with AI": a brief in, a draft out, inserted where the user is editing. */
export function AiWriteButton({
  slug,
  format,
  onInsert,
  onUseSubject,
}: {
  slug: string;
  format: "html" | "text";
  onInsert: (draft: AiDraft) => void;
  onUseSubject?: (subject: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles />
        Write with AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Write with AI</DialogTitle>
            <DialogDescription>
              Say what the email is for. You get a draft to read over before it goes in.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await draftEmailAction(slug, brief, format);
                if (!result.ok) setError(result.error);
                else setDraft(result.result);
              });
            }}
          >
            <Label htmlFor="ai-brief">What should the email say?</Label>
            <Textarea
              id="ai-brief"
              rows={4}
              maxLength={5000}
              placeholder="e.g. Announce our spring sale: 20% off all boots until Sunday, link to https://shop.example/boots"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
            <Button type="submit" className="w-fit" disabled={pending}>
              {pending ? "Writing…" : draft ? "Write another" : "Write it"}
            </Button>
          </form>
          <FormError message={error} />
          {draft && (
            <section aria-label="AI draft" className="grid gap-2 rounded-md border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Subject: </span>
                <span className="font-medium">{draft.subject}</span>
              </p>
              <div className="max-h-60 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                {draft.text}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onInsert(draft);
                    setOpen(false);
                  }}
                >
                  Insert into the email
                </Button>
                {onUseSubject && (
                  <Button size="sm" variant="outline" onClick={() => onUseSubject(draft.subject)}>
                    Use the subject
                  </Button>
                )}
              </div>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Five subject lines for the email as written; one click uses one. */
export function SubjectSuggestions({
  slug,
  getContent,
  onPick,
}: {
  slug: string;
  getContent: () => string;
  onPick: (subject: string) => void;
}) {
  const [subjects, setSubjects] = useState<string[] | null>(null);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="What the email is for (optional)"
          placeholder="What it's for (optional), e.g. get people to the webinar"
          className="max-w-sm"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await suggestSubjectsAction(slug, getContent(), goal);
              if (!result.ok) setError(result.error);
              else setSubjects(result.result.subjects.slice(0, 5));
            })
          }
        >
          <Sparkles />
          {pending ? "Thinking…" : "Suggest subject lines"}
        </Button>
      </div>
      <FormError message={error} />
      {subjects && (
        <ul aria-label="Suggested subject lines" className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <li key={s}>
              <Button variant="secondary" size="sm" onClick={() => onPick(s)}>
                {s}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
