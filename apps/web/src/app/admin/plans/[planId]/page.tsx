import { getPlan } from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const plan = planId === "new" ? null : await getPlan(planId);
  if (planId !== "new" && !plan) notFound();
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{plan ? plan.name : "New plan"}</h1>
      <PlanForm
        planId={plan?.id ?? null}
        initial={
          plan
            ? {
                key: plan.key,
                name: plan.name,
                description: plan.description,
                priceCents: plan.priceCents,
                currency: plan.currency,
                stripePriceId: plan.stripePriceId ?? "",
                limits: plan.limits,
                features: plan.features,
                public: plan.public,
                sortOrder: plan.sortOrder,
                archived: plan.archived,
              }
            : null
        }
      />
    </div>
  );
}
