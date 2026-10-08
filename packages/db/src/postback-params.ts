// Browser-safe. Reading what affiliate networks send in postbacks: each
// names things its own way, so several spellings are accepted.

export type PostbackStatus = "pending" | "approved" | "rejected" | "reversed";
export type PostbackEvent = "sale" | "lead" | "signup" | "custom";

export type ParsedPostback = {
  clickId: string | null;
  value: number;
  currency: string;
  status: PostbackStatus;
  event: PostbackEvent;
  txid: string | null;
  network: string | null;
};

const first = (params: Record<string, string>, names: string[]) => {
  for (const name of names) {
    const value = params[name]?.trim();
    // Unfilled network macros ("{subid}", "[TXID]", "#payout#") mean "not given".
    if (value && !/^[{[#%].*[}\]#%]$/.test(value)) return value;
  }
  return null;
};

/** "12.50", "$12.50", "12,50", "1,234.50" -> number; null when not a number. */
export function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  let value = raw.replace(/[^\d.,-]/g, "");
  if (value.includes(",") && value.includes(".")) value = value.replace(/,/g, "");
  else if (value.includes(",")) value = value.replace(",", ".");
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const STATUS_WORDS: [RegExp, PostbackStatus][] = [
  [/^(refund(ed)?|chargeback|charged_?back|revers(ed|al)|cancel(l?ed)?|void(ed)?)$/i, "reversed"],
  [/^(reject(ed)?|declined?|denied|deny|invalid|fraud)$/i, "rejected"],
  [/^(pending|hold|on_?hold|waiting|0)$/i, "pending"],
  [/^(approved?|confirmed?|success|sale|paid|complete(d)?|1)$/i, "approved"],
];

export function parseStatus(raw: string | null): PostbackStatus {
  if (!raw) return "approved";
  return STATUS_WORDS.find(([pattern]) => pattern.test(raw.trim()))?.[1] ?? "approved";
}

export function parsePostback(params: Record<string, string>): ParsedPostback {
  const lower = Object.fromEntries(Object.entries(params).map(([k, v]) => [k.toLowerCase(), v]));
  const amount = parseAmount(
    first(lower, ["payout", "amount", "value", "revenue", "commission", "sum"]),
  );
  let status = parseStatus(first(lower, ["status", "conversion_status", "state"]));
  // A negative payout is the network taking the money back.
  if (amount !== null && amount < 0) status = "reversed";
  const event = first(lower, ["event", "type", "goal"])?.toLowerCase();
  return {
    clickId: first(lower, [
      "cid",
      "click_id",
      "clickid",
      "sc_cid",
      "subid",
      "sub_id",
      "sub1",
      "tid",
      "aff_sub",
    ]),
    value: Math.abs(amount ?? 0),
    currency: (first(lower, ["currency", "cur"]) ?? "USD").toUpperCase().slice(0, 3),
    status,
    event: event === "lead" || event === "signup" || event === "custom" ? event : "sale",
    txid: first(lower, [
      "txid",
      "transaction_id",
      "transid",
      "order_id",
      "orderid",
      "conversion_id",
    ]),
    network: first(lower, ["network", "source"])?.toLowerCase() ?? null,
  };
}

/** Whether an IP is allowed by a list of IPs and IPv4 CIDR ranges (an empty list allows all). */
export function ipAllowed(ip: string | null, allowed: string[]) {
  if (allowed.length === 0) return true;
  if (!ip) return false;
  const v4 = ip.replace(/^::ffff:/i, "");
  const toInt = (address: string) =>
    address.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
  return allowed.some((rule) => {
    const [range, bits] = rule.trim().split("/");
    if (!bits) return range === v4 || range === ip;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4) || !/^\d+\.\d+\.\d+\.\d+$/.test(range!)) return false;
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (toInt(v4) & mask) === (toInt(range!) & mask);
  });
}
