// Browser-safe. Leads from form tools and CRMs (D50): flat fields, named
// however the tool names them, so several spellings are accepted. The same
// lead id again moves the lead along: new -> qualified -> sold (with its
// value) or lost.

import { parseAmount, type PostbackStatus } from "./postback-params";

export type LeadStageName = "new" | "qualified" | "sold" | "lost";

export type ParsedLead = {
  /** The tool's id for the lead (submission, entry, deal): later updates use it. */
  leadId: string | null;
  email: string | null;
  clickId: string | null;
  stage: LeadStageName;
  /** null: not given (an update keeps the value it had). */
  value: number | null;
  currency: string;
  firstName: string | null;
  lastName: string | null;
};

const STAGES: [RegExp, LeadStageName][] = [
  [/^(new|pending|open|received|submitted|created)$/i, "new"],
  [/^(qualified|contacted|in[ _-]?progress|working|mql|sql|approved)$/i, "qualified"],
  [/^(sold|won|closed[ _-]?won|converted|customer|paid)$/i, "sold"],
  [/^(lost|closed[ _-]?lost|rejected|disqualified|unqualified|invalid|spam|junk)$/i, "lost"],
];

/** Only sold leads count as revenue; lost ones never will. */
export const LEAD_STATUS: Record<LeadStageName, PostbackStatus> = {
  new: "pending",
  qualified: "pending",
  sold: "approved",
  lost: "rejected",
};

export function parseLeadStage(raw: string | null): LeadStageName | null {
  if (!raw) return null;
  return STAGES.find(([pattern]) => pattern.test(raw.trim()))?.[1] ?? null;
}

export function parseLead(
  params: Record<string, string>,
): { ok: true; lead: ParsedLead } | { ok: false; error: string } {
  // "First Name", "first-name" and "firstName" all become "firstname".
  const fields = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k.toLowerCase().replace(/[\s_-]/g, ""), v.trim()]),
  );
  const first = (...names: string[]) => {
    for (const name of names) if (fields[name]) return fields[name]!;
    return null;
  };

  const email = first("email", "emailaddress", "mail")?.toLowerCase().slice(0, 254) ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "email isn't an email address." };
  }
  const leadId =
    first("leadid", "submissionid", "responseid", "entryid", "dealid", "id")?.slice(0, 200) ?? null;
  if (!email && !leadId) return { ok: false, error: "Send the lead's email or lead_id." };

  const rawStage = first("stage", "status", "leadstatus", "leadstage");
  const stage = rawStage ? parseLeadStage(rawStage) : "new";
  if (!stage) {
    return { ok: false, error: `Unknown status "${rawStage}": use new, qualified, sold or lost.` };
  }
  const rawValue = first("value", "amount", "revenue", "dealvalue", "price");
  const value = rawValue === null ? null : parseAmount(rawValue);
  if (rawValue !== null && (value === null || value < 0)) {
    return { ok: false, error: "value must be a number, e.g. 500." };
  }
  const clickId = first("sccid", "clickid", "cid");
  const currency = first("currency")?.toUpperCase();

  let firstName = first("firstname", "fname", "givenname");
  let lastName = first("lastname", "lname", "surname", "familyname");
  const fullName = first("name", "fullname");
  if (!firstName && !lastName && fullName) {
    const [given, ...rest] = fullName.split(/\s+/);
    firstName = given ?? null;
    lastName = rest.join(" ") || null;
  }

  return {
    ok: true,
    lead: {
      leadId,
      email,
      clickId: clickId && /^[\w-]{4,64}$/.test(clickId) ? clickId : null,
      stage,
      value,
      currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD",
      firstName: firstName?.slice(0, 100) ?? null,
      lastName: lastName?.slice(0, 100) ?? null,
    },
  };
}
