// Browser-safe. What a plan allows (D71): limits (null = unlimited) and
// features. Quotas are enforced in D73; the rest of the limits and the
// features where each one applies (the plans editor, after Acelle's).

export type PlanLimits = {
  /** Subscribers across the account's workspaces (unsubscribed ones don't count). */
  subscribers: number | null;
  /** Emails sent per calendar month (UTC), across the account's workspaces. */
  sendsPerMonth: number | null;
  /** Workspaces the account owns. */
  workspaces: number | null;
  /** People per workspace, owner included. */
  teamMembers: number | null;
  /** Lists across the account's workspaces. */
  lists: number | null;
  /** Live automations across the account's workspaces. */
  automations: number | null;
  /** Signup forms across the account's workspaces. */
  forms: number | null;
  /** Segments across the account's workspaces. */
  segments: number | null;
  /** Sending domains across the account's workspaces. */
  sendingDomains: number | null;
  /** The account's own sending servers. */
  sendingServers: number | null;
  /** Largest file to import or upload, in megabytes. */
  uploadMb: number | null;
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
  /** Importing subscribers from a file. */
  importContacts: boolean;
  /** Downloading subscribers and suppressions. */
  exportContacts: boolean;
  /** Connecting their own SES or SMTP servers. */
  ownSendingServers: boolean;
};

export const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  subscribers: "Subscribers",
  sendsPerMonth: "Emails a month",
  workspaces: "Workspaces",
  teamMembers: "Team members per workspace",
  lists: "Lists",
  automations: "Live automations",
  forms: "Signup forms",
  segments: "Segments",
  sendingDomains: "Sending domains",
  sendingServers: "Own sending servers",
  uploadMb: "Largest upload (MB)",
};

/** The editor's groups, as in Acelle's plan settings. */
export const LIMIT_GROUPS: { title: string; keys: (keyof PlanLimits)[] }[] = [
  { title: "Sending", keys: ["sendsPerMonth", "sendingDomains", "sendingServers"] },
  { title: "Audience", keys: ["subscribers", "lists", "segments", "forms"] },
  { title: "Account", keys: ["workspaces", "teamMembers", "automations", "uploadMb"] },
];

export const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  automations: "Automations",
  abTests: "A/B tests",
  aiAssist: "AI assist",
  utmcap: "UTMCAP integration",
  api: "API and webhooks",
  removeBranding: "No Sendcoop footer",
  importContacts: "Import contacts",
  exportContacts: "Export contacts",
  ownSendingServers: "Own sending servers",
};

export const FEATURE_GROUPS: { title: string; keys: (keyof PlanFeatures)[] }[] = [
  { title: "Marketing", keys: ["automations", "abTests", "aiAssist"] },
  { title: "Integrations", keys: ["api", "utmcap"] },
  { title: "Contacts", keys: ["importContacts", "exportContacts"] },
  { title: "Delivery and brand", keys: ["ownSendingServers", "removeBranding"] },
];

// Plans saved before a limit or feature existed: unlimited, and on.
const NEW_LIMITS: PlanLimits = {
  subscribers: null,
  sendsPerMonth: null,
  workspaces: null,
  teamMembers: null,
  lists: null,
  automations: null,
  forms: null,
  segments: null,
  sendingDomains: null,
  sendingServers: null,
  uploadMb: null,
};
const NEW_FEATURES: PlanFeatures = {
  automations: true,
  abTests: true,
  aiAssist: true,
  utmcap: true,
  api: true,
  removeBranding: true,
  importContacts: true,
  exportContacts: true,
  ownSendingServers: true,
};

/** Plan limits with overrides on top. */
export function effectiveLimits(
  plan: Partial<PlanLimits>,
  overrides?: Partial<PlanLimits> | null,
): PlanLimits {
  return { ...NEW_LIMITS, ...plan, ...(overrides ?? {}) };
}

export function effectiveFeatures(
  plan: Partial<PlanFeatures>,
  overrides?: Partial<PlanFeatures> | null,
): PlanFeatures {
  return { ...NEW_FEATURES, ...plan, ...(overrides ?? {}) };
}

/** "10,000", or "Unlimited" (also for a limit a plan doesn't have). */
export function formatLimit(value: number | null | undefined) {
  return value === null || value === undefined ? "Unlimited" : value.toLocaleString("en");
}
