import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { LEAD_STATUS, type ParsedLead } from "../lead-params";
import { listMemberships, lists, subscribers } from "../schema";
import { refreshMessageRevenue } from "./attribution";
import { recordConversion } from "./conversions";
import { reportingCurrencySql } from "./currency";

// Leads (D50): a conversion with event "lead" whose stage moves along as the
// lead is worked. Only a sold lead counts as revenue, with the value it sold
// for, so moving a lead to sold (or back) updates the email's revenue.

/** Leads are found again by the tool's id for them, else by email. */
export const leadTxid = (lead: Pick<ParsedLead, "leadId" | "email">) =>
  `lead:${lead.leadId ?? `email:${lead.email}`}`;

export type LeadResult = {
  result: "created" | "updated" | "duplicate";
  id: string | null;
  stage: ParsedLead["stage"];
  method?: "click" | "email" | "subscriber" | "none";
};

export async function recordLead(
  workspaceId: string,
  lead: ParsedLead,
  payload: Record<string, unknown>,
): Promise<LeadResult> {
  const txid = leadTxid(lead);
  const status = LEAD_STATUS[lead.stage];

  // Known lead: move it along (a value only replaces the old one when given).
  const [updated] = await getDb().execute<{ id: string; message_id: string | null }>(sql`
    update conversions set
      lead_stage = ${lead.stage}::lead_stage,
      status = ${status}::conversion_status,
      value = coalesce(${lead.value}, value),
      currency = case when ${lead.value}::numeric is null then currency else ${lead.currency} end,
      fx_rate = case when ${lead.value}::numeric is null then fx_rate
        else sc_fx_rate(${lead.currency}, ${reportingCurrencySql(workspaceId)}, created_at) end,
      updated_at = now()
    where workspace_id = ${workspaceId} and external_txid = ${txid}
      and (lead_stage is distinct from ${lead.stage}::lead_stage
           or (${lead.value}::numeric is not null and value <> ${lead.value}))
    returning id, message_id`);
  if (updated) {
    if (updated.message_id) await refreshMessageRevenue(updated.message_id);
    return { result: "updated", id: updated.id, stage: lead.stage };
  }

  const recorded = await recordConversion(workspaceId, {
    source: "lead",
    event: "lead",
    clickId: lead.clickId,
    email: lead.email,
    value: lead.value ?? 0,
    currency: lead.currency,
    status,
    leadStage: lead.stage,
    txid,
    network: null,
    payload,
  });
  // Already there with the same stage and value: nothing new.
  return {
    result: recorded.result === "created" ? "created" : "duplicate",
    id: recorded.id,
    stage: lead.stage,
    method: recorded.method,
  };
}

/**
 * Puts a new lead on a list. Like a signup form, it only fills gaps in an
 * existing subscriber, and never re-adds people who bounced or complained.
 */
export async function addLeadToList(
  workspaceId: string,
  listId: string,
  lead: Pick<ParsedLead, "email" | "firstName" | "lastName">,
) {
  if (!lead.email) return false;
  const db = getDb();
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.workspaceId, workspaceId), eq(lists.id, listId)));
  if (!list) return false;
  await db
    .insert(subscribers)
    .values({
      workspaceId,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      status: "subscribed",
      source: "integration",
      subscribedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [subscribers.workspaceId, subscribers.email],
      set: {
        firstName: sql`coalesce(${subscribers.firstName}, excluded.first_name)`,
        lastName: sql`coalesce(${subscribers.lastName}, excluded.last_name)`,
      },
    });
  const [subscriber] = await db
    .select({ id: subscribers.id, status: subscribers.status })
    .from(subscribers)
    .where(and(eq(subscribers.workspaceId, workspaceId), eq(subscribers.email, lead.email)));
  if (!subscriber || subscriber.status === "bounced" || subscriber.status === "complained") {
    return false;
  }
  await db
    .insert(listMemberships)
    .values({ listId: list.id, subscriberId: subscriber.id })
    .onConflictDoNothing();
  return true;
}
