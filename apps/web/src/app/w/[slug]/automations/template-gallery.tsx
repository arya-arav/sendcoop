"use client";

import type { AutomationTemplate } from "@sendcoop/db/automation-templates";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { installAutomationTemplateAction } from "./actions";

const AUDIENCE: Record<AutomationTemplate["audience"], string> = {
  everyone: "Any list",
  affiliate: "Affiliates",
  ecommerce: "Stores",
  leadgen: "Lead generation",
};

/** Ready-made flows: one click makes a draft with its emails written. */
export function TemplateGallery({
  slug,
  templates,
}: {
  slug: string;
  templates: Pick<AutomationTemplate, "id" | "name" | "description" | "audience" | "setup">[];
}) {
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <section aria-labelledby="templates-heading" className="grid gap-3">
      <h2 id="templates-heading" className="text-lg font-semibold tracking-tight">
        Start from a ready-made flow
      </h2>
      <FormError message={error} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <li key={t.id}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <h3>{t.name}</h3>
                  <Badge variant="outline">{AUDIENCE[t.audience]}</Badge>
                </CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto grid gap-2">
                {t.setup && <p className="text-xs text-muted-foreground">{t.setup}</p>}
                <Button
                  variant="outline"
                  className="w-fit"
                  disabled={installing !== null}
                  aria-label={`Use ${t.name}`}
                  onClick={() => {
                    setInstalling(t.id);
                    setError(null);
                    startTransition(async () => {
                      const result = await installAutomationTemplateAction(slug, t.id);
                      if (result && !result.ok) {
                        setError(result.error);
                        setInstalling(null);
                      }
                    });
                  }}
                >
                  {installing === t.id ? "Setting up…" : "Use this flow"}
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
