// Browser-safe. Abuse protection (D76): how much a new account may send per
// day while it builds a record, which addresses make a risky list, and when
// an account's complaints or bounces suspend it.

/** Daily emails for a new account, by age; from day 14 only the plan's limits apply. */
export const WARMUP_STEPS = [
  { untilDay: 1, perDay: 1_000 },
  { untilDay: 3, perDay: 5_000 },
  { untilDay: 7, perDay: 20_000 },
  { untilDay: 14, perDay: 50_000 },
] as const;

const DAY = 86_400_000;

/** The account's daily cap now (null once warmed up), and when it next rises. */
export function warmupLimit(createdAt: Date, now = new Date()) {
  const ageDays = (now.getTime() - createdAt.getTime()) / DAY;
  const step = WARMUP_STEPS.find((s) => ageDays < s.untilDay);
  if (!step) return null;
  return { perDay: step.perDay, risesAt: new Date(createdAt.getTime() + step.untilDay * DAY) };
}

/** Shared mailboxes nobody signed up with; they complain and bounce more. */
export const ROLE_PREFIXES = [
  "abuse",
  "admin",
  "billing",
  "contact",
  "help",
  "hostmaster",
  "info",
  "marketing",
  "noc",
  "noreply",
  "no-reply",
  "office",
  "postmaster",
  "privacy",
  "sales",
  "security",
  "support",
  "webmaster",
] as const;

/** Throwaway inboxes: a list full of them was scraped or faked. */
export const DISPOSABLE_DOMAINS = [
  "10minutemail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
] as const;

export function riskyAddress(email: string): "role" | "disposable" | null {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if ((DISPOSABLE_DOMAINS as readonly string[]).includes(domain)) return "disposable";
  if ((ROLE_PREFIXES as readonly string[]).includes(local)) return "role";
  return null;
}

/** A campaign can't go out when this share of its recipients is risky (and there are enough). */
export const LIST_QUALITY = { minRecipients: 50, maxRiskyShare: 0.3 } as const;

/**
 * Account-wide limits over the last week. Higher than one campaign's pause
 * (health.ts), since crossing them suspends the whole account.
 */
export const ACCOUNT_HEALTH = { days: 7, minSent: 500, complaint: 0.005, bounce: 0.08 } as const;
