// A typed client for the parts of the UTMCAP API Sendcoop uses
// (https://app.utmcap.com/api/v1/openapi.json, docs.utmcap.com/api/).
// Every answer is { data, error }; lists come 500 rows a page with a
// next_cursor; past the per-minute limit the answer is 429 with Retry-After,
// which is waited out and retried. Creating things sends an Idempotency-Key,
// so a retry never makes two.

export const UTMCAP_API_URL = "https://app.utmcap.com/api/v1";

export type UtmcapStatus = "approved" | "pending" | "rejected" | "chargeback";

export type UtmcapCampaign = {
  id: string;
  name: string;
  alias: string;
  status: string;
  /** The tracking link: https://{domain}/{alias}. */
  url: string;
  domain: string | null;
  source_id: string | null;
  source_name: string | null;
  currency: string;
  created_at: string;
  clicks: number;
  conversions: number;
  revenue: number;
};

export type UtmcapTrafficSource = {
  id: string;
  name: string;
  postback_url: string | null;
  token_macros: Record<string, string>;
  external_id_param: string | null;
  status: "active" | "paused";
  created_at: string;
};

export type NewTrafficSource = {
  name: string;
  token_macros?: Record<string, string>;
  postback_url?: string;
  external_id_param?: string;
  notes?: string;
  tags?: string[];
};

export type UtmcapWebhookEvent =
  | "conversion.created"
  | "conversion.updated"
  | "link.broken"
  | "link.unsafe"
  | "campaign.paused"
  | "plan.limit_reached";

export type UtmcapWebhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
};

export type UtmcapClick = {
  click_id: string;
  hops: Record<string, unknown>[];
  conversions: Record<string, unknown>[];
  /** Sub slot labels and similar, as the API gives them. */
  names: Record<string, unknown>;
  visitor: Record<string, unknown> | null;
};

export type PerformanceRow = {
  dims: string[];
  dimension: string;
  clicks: number;
  unique_clicks: number;
  conversions: number;
  pending: number;
  rejected: number;
  revenue: number;
  pending_revenue: number;
  rejected_revenue: number;
};

/** What a conversion webhook carries (docs.utmcap.com/api/webhooks/). */
export type UtmcapWebhookPayload = {
  id: string;
  type: string;
  created_at: string;
  account_id: string;
  data: {
    click_id: string;
    conversion_id: string | null;
    status: string;
    payout: number;
    currency: string;
    goal?: string | null;
    campaign_id?: string | null;
    offer_id?: string | null;
    source_id?: string | null;
    recorded_at?: string;
    source?: string;
  };
};

export class UtmcapError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "UtmcapError";
  }
}

type Options = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Retries after a 429 (each waits Retry-After) or a network error. */
  maxRetries?: number;
  /** Longest wait honoured for one Retry-After, in seconds. */
  maxWaitSeconds?: number;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class UtmcapClient {
  readonly baseUrl: string;
  private readonly options: Required<Omit<Options, "baseUrl">>;

  constructor(options: Options) {
    this.baseUrl = (options.baseUrl ?? process.env.UTMCAP_API_URL ?? UTMCAP_API_URL).replace(
      /\/+$/,
      "",
    );
    this.options = {
      apiKey: options.apiKey,
      fetch: options.fetch ?? fetch,
      maxRetries: options.maxRetries ?? 3,
      maxWaitSeconds: options.maxWaitSeconds ?? 60,
      sleep: options.sleep ?? wait,
    };
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    {
      query,
      body,
      idempotencyKey,
    }: {
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.options.apiKey}`,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.options.fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (attempt < this.options.maxRetries) {
          await this.options.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new UtmcapError(
          `UTMCAP didn't answer (${error instanceof Error ? error.message : "network error"}).`,
          0,
          "network",
        );
      }
      if (response.status === 429 && attempt < this.options.maxRetries) {
        const seconds = Math.min(
          Number(response.headers.get("retry-after") ?? 60) || 60,
          this.options.maxWaitSeconds,
        );
        await this.options.sleep(seconds * 1000);
        continue;
      }
      let envelope: { data: T; error: { message: string; code: string } | null };
      try {
        envelope = (await response.json()) as typeof envelope;
      } catch {
        throw new UtmcapError(
          `UTMCAP answered ${response.status} without JSON.`,
          response.status,
          "bad_response",
        );
      }
      if (!response.ok || envelope.error) {
        throw new UtmcapError(
          envelope.error?.message ?? `UTMCAP answered ${response.status}.`,
          response.status,
          envelope.error?.code ?? "error",
        );
      }
      return envelope.data;
    }
  }

  /** Every row of a paged list. */
  private async all<T>(path: string, query: Record<string, string | undefined> = {}) {
    const rows: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.request<{ rows: T[]; next_cursor: string | null }>("GET", path, {
        query: { ...query, limit: 500, cursor },
      });
      rows.push(...page.rows);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return rows;
  }

  listCampaigns() {
    return this.all<UtmcapCampaign>("/campaigns");
  }

  listTrafficSources() {
    return this.all<UtmcapTrafficSource>("/traffic-sources");
  }

  createTrafficSource(source: NewTrafficSource, idempotencyKey?: string) {
    return this.request<UtmcapTrafficSource>("POST", "/traffic-sources", {
      body: source,
      idempotencyKey,
    });
  }

  async listWebhooks() {
    return (await this.request<{ rows: UtmcapWebhook[] }>("GET", "/webhooks")).rows;
  }

  /** The answer carries the signing secret (whsec_…) this once. */
  createWebhook(
    webhook: { url: string; events: UtmcapWebhookEvent[]; name?: string },
    idempotencyKey?: string,
  ) {
    return this.request<UtmcapWebhook & { secret: string }>("POST", "/webhooks", {
      body: webhook,
      idempotencyKey,
    });
  }

  getClick(clickId: string) {
    return this.request<UtmcapClick>("GET", `/logs/clicks/${encodeURIComponent(clickId)}`);
  }

  async performance(options: {
    from: string;
    to: string;
    dimension: string;
    filters?: Record<string, string>;
  }) {
    const query: Record<string, string> = {
      from: options.from,
      to: options.to,
      dimension: options.dimension,
    };
    for (const [k, v] of Object.entries(options.filters ?? {})) query[`f.${k}`] = v;
    return (
      await this.request<{ rows: PerformanceRow[] }>("GET", "/reports/performance", { query })
    ).rows;
  }
}
