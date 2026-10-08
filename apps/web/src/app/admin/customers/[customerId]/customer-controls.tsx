"use client";

import { LIMIT_LABELS, type PlanLimits } from "@sendcoop/db/plans";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  changePlanAction,
  impersonateAction,
  saveOverridesAction,
  suspendAction,
  unsuspendAction,
} from "../actions";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useAction() {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      setMessage(
        result.ok
          ? result.message
            ? { text: result.message, error: false }
            : null
          : { text: result.error, error: true },
      );
    });
  const view = message && (
    <p
      role={message.error ? "alert" : "status"}
      className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
    >
      {message.text}
    </p>
  );
  return { pending, run, view };
}

export function CustomerControls({
  customerId,
  planId,
  plans,
  overrides,
  banned,
  isAdmin,
}: {
  customerId: string;
  planId: string | null;
  plans: { id: string; name: string; archived: boolean }[];
  overrides: Record<string, string>;
  banned: boolean;
  isAdmin: boolean;
}) {
  const [plan, setPlan] = useState(planId ?? "");
  const [limits, setLimits] = useState<Record<string, string>>(overrides);
  const [reason, setReason] = useState("");
  const planAction = useAction();
  const overrideAction = useAction();
  const accessAction = useAction();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Plan and overrides</h2>
          </CardTitle>
          <CardDescription>
            Overrides beat the plan&apos;s limits for this account: a number, &quot;unlimited&quot;,
            or blank for the plan&apos;s.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="customer-plan">Plan</Label>
              <NativeSelect
                id="customer-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              >
                <NativeSelectOption value="" disabled>
                  Choose a plan
                </NativeSelectOption>
                {plans.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                    {p.archived ? " (archived)" : ""}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button
              variant="outline"
              disabled={planAction.pending || !plan}
              onClick={() => planAction.run(() => changePlanAction(customerId, plan))}
            >
              Change plan
            </Button>
          </div>
          {planAction.view}
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              overrideAction.run(() => saveOverridesAction(customerId, limits));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((key) => (
                <div key={key} className="grid gap-1">
                  <Label htmlFor={`override-${key}`}>{LIMIT_LABELS[key]}</Label>
                  <Input
                    id={`override-${key}`}
                    placeholder="Plan's"
                    value={limits[key] ?? ""}
                    onChange={(e) => setLimits({ ...limits, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <Button
              type="submit"
              variant="outline"
              className="w-fit"
              disabled={overrideAction.pending}
            >
              Save overrides
            </Button>
            {overrideAction.view}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Access</h2>
          </CardTitle>
          <CardDescription>
            Suspending ends their sessions, stops them logging in, and stops every send from their
            workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isAdmin ? (
            <p className="text-sm text-muted-foreground">
              Admins can&apos;t be suspended or viewed as.
            </p>
          ) : (
            <>
              <Button
                variant="outline"
                className="w-fit"
                disabled={accessAction.pending}
                onClick={() => accessAction.run(() => impersonateAction(customerId))}
              >
                Log in as them
              </Button>
              {banned ? (
                <Button
                  variant="outline"
                  className="w-fit"
                  disabled={accessAction.pending}
                  onClick={() => accessAction.run(() => unsuspendAction(customerId))}
                >
                  Lift the suspension
                </Button>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="suspend-reason">Reason for suspending</Label>
                  <Textarea
                    id="suspend-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    variant="destructive"
                    className="w-fit"
                    disabled={accessAction.pending}
                    onClick={() => {
                      if (confirm("Suspend this account?")) {
                        accessAction.run(() => suspendAction(customerId, reason));
                      }
                    }}
                  >
                    Suspend account
                  </Button>
                </div>
              )}
            </>
          )}
          {accessAction.view}
        </CardContent>
      </Card>
    </div>
  );
}
