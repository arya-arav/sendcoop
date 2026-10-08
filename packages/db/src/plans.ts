// Browser-safe. What a plan allows (D71): limits (null = unlimited) and
// features. Quotas are enforced in D73.

export type PlanLimits = {
  /** Subscribers across the account's workspaces (unsubscribed ones don't count). */
  subscribers: number | null;
  /** Emails sent per calendar month (UTC), across the account's workspaces. */
  sendsPerMonth: number | null;
  /** Workspaces the account owns. */
  workspaces: number | null;
  /** People per workspace, owner included. */
  teamMembers: number | null;
};

export type PlanFeatures = {
  automations: boolean;
  abTests: boolean;
  aiAssist: boolean;
  utmcap: boolean;
  /** The REST API and outgoing webhooks (D77, D78). */
  api: boolean;
  /** Sendcoop's footer link can be removed. */
  removeBranding: boolean;
};

export const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  subscribers: "Subscribers",
  sendsPerMonth: "Emails a month",
  workspaces: "Workspaces",
  teamMembers: "Team members per workspace",
};

export const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  automations: "Automations",
  abTests: "A/B tests",
  aiAssist: "AI assist",
  utmcap: "UTMCAP integration",
  api: "API and webhooks",
  removeBranding: "No Sendcoop footer",
};

/** Plan limits with overrides on top. */
export function effectiveLimits(
  plan: PlanLimits,
  overrides?: Partial<PlanLimits> | null,
): PlanLimits {
  return { ...plan, ...(overrides ?? {}) };
}

export function effectiveFeatures(
  plan: PlanFeatures,
  overrides?: Partial<PlanFeatures> | null,
): PlanFeatures {
  return { ...plan, ...(overrides ?? {}) };
}

/** "10,000", or "Unlimited". */
export function formatLimit(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString("en");
}
