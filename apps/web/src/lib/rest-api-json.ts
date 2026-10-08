import type { ApiSubscriber } from "@sendcoop/db";

// What the REST API returns: snake_case, ISO dates (D77).

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

export function subscriberJson(s: ApiSubscriber) {
  return {
    id: s.id,
    email: s.email,
    first_name: s.firstName,
    last_name: s.lastName,
    status: s.status,
    source: s.source,
    fields: s.fields,
    timezone: s.timezone,
    lists: s.lists,
    subscribed_at: iso(s.subscribedAt),
    unsubscribed_at: iso(s.unsubscribedAt),
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
  };
}

export function conversionJson(c: {
  id: string;
  event: string;
  status: string;
  value: number;
  currency: string;
  valueBase: number | null;
  source: string;
  clickId: string | null;
  externalTxid: string | null;
  campaignId: string | null;
  automationId: string | null;
  subscriberId: string | null;
  createdAt: Date;
}) {
  return {
    id: c.id,
    event: c.event,
    status: c.status,
    value: c.value,
    currency: c.currency,
    value_in_reporting_currency: c.valueBase,
    source: c.source,
    click_id: c.clickId,
    txid: c.externalTxid,
    campaign_id: c.campaignId,
    automation_id: c.automationId,
    subscriber_id: c.subscriberId,
    created_at: iso(c.createdAt),
  };
}
