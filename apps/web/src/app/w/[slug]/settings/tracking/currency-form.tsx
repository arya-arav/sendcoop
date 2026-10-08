"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { saveCurrencyAction } from "./actions";

/** The currency reports add revenue up in. */
export function CurrencyForm({
  slug,
  editable,
  currency,
  currencies,
}: {
  slug: string;
  editable: boolean;
  currency: string;
  currencies: string[];
}) {
  const [chosen, setChosen] = useState(currency);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Reporting currency</h2>
        </CardTitle>
        <CardDescription>
          Sales arrive in whatever currency the network or store uses. Reports convert them to this
          one, at the European Central Bank&apos;s rate on the day of each sale.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await saveCurrencyAction(slug, chosen);
              if (!result.ok) setError(result.error);
              else setMessage("Saved. Revenue is now shown in " + chosen + ".");
            });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="reporting-currency">Currency</Label>
            <NativeSelect
              id="reporting-currency"
              value={chosen}
              disabled={!editable}
              onChange={(e) => {
                setChosen(e.target.value);
                setMessage(null);
              }}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
          {editable && (
            <Button type="submit" disabled={pending || chosen === currency}>
              {pending ? "Converting…" : "Save"}
            </Button>
          )}
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
          <FormError message={error} />
        </form>
      </CardContent>
    </Card>
  );
}
