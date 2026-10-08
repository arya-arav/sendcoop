import { getUtmcapConnection, slugForUtm, utmcapTotalsByCampaign } from "@sendcoop/db";
import { UtmcapClient } from "@sendcoop/utmcap";

// Reconciliation (D60): UTMCAP's numbers for the Sendcoop traffic source,
// by sub1 (the email campaign), next to the conversions Sendcoop recorded
// from it. Revenue is compared as reported (UTMCAP's currency), approved
// conversions only on both sides.

export type ReconcileRow = {
  /** The sub1 value: the campaign's name as a slug. */
  key: string;
  campaignId: string | null;
  campaignName: string | null;
  utmcap: { conversions: number; revenue: number };
  sendcoop: { conversions: number; revenue: number };
  matches: boolean;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function compareTotals(
  utmcapRows: { key: string; conversions: number; revenue: number }[],
  sendcoopRows: {
    campaign_id: string | null;
    campaign_name: string | null;
    conversions: number;
    revenue: number;
  }[],
): ReconcileRow[] {
  const rows = new Map<string, ReconcileRow>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) {
      r = {
        key,
        campaignId: null,
        campaignName: null,
        utmcap: { conversions: 0, revenue: 0 },
        sendcoop: { conversions: 0, revenue: 0 },
        matches: false,
      };
      rows.set(key, r);
    }
    return r;
  };
  for (const u of utmcapRows) {
    const r = row(u.key || "(no sub1)");
    r.utmcap.conversions += u.conversions;
    r.utmcap.revenue += u.revenue;
  }
  for (const s of sendcoopRows) {
    const r = row(s.campaign_name ? slugForUtm(s.campaign_name) : "(no campaign)");
    r.campaignId ??= s.campaign_id;
    r.campaignName ??= s.campaign_name;
    r.sendcoop.conversions += s.conversions;
    r.sendcoop.revenue += s.revenue;
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      utmcap: { ...r.utmcap, revenue: Math.round(r.utmcap.revenue * 100) / 100 },
      sendcoop: { ...r.sendcoop, revenue: Math.round(r.sendcoop.revenue * 100) / 100 },
      matches:
        r.utmcap.conversions === r.sendcoop.conversions &&
        Math.abs(r.utmcap.revenue - r.sendcoop.revenue) < 0.01,
    }))
    .sort(
      (a, b) => b.utmcap.revenue + b.sendcoop.revenue - (a.utmcap.revenue + a.sendcoop.revenue),
    );
}

export async function reconcileUtmcap(workspaceId: string, days = 30) {
  const connection = await getUtmcapConnection(workspaceId);
  if (!connection) return null;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  from.setUTCHours(0, 0, 0, 0);
  const [report, ours] = await Promise.all([
    new UtmcapClient({ apiKey: connection.apiKey }).performance({
      from: ymd(from),
      to: ymd(to),
      dimension: "sub1",
      filters: { source: connection.sourceId },
    }),
    utmcapTotalsByCampaign(workspaceId, from, new Date(to.getTime() + 60_000)),
  ]);
  return compareTotals(
    report.map((r) => ({
      key: r.dims[0] ?? r.dimension ?? "",
      conversions: r.conversions,
      revenue: r.revenue,
    })),
    ours,
  );
}
