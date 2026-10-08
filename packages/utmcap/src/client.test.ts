import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UtmcapClient, UtmcapError } from "./client";
import { type FakeUtmcap, startFakeUtmcap } from "./fake";
import { signUtmcapBody, verifyUtmcapSignature } from "./signature";

let fake: FakeUtmcap;
let client: UtmcapClient;
const sleeps: number[] = [];

beforeAll(async () => {
  fake = await startFakeUtmcap();
  client = new UtmcapClient({
    apiKey: fake.apiKey,
    baseUrl: fake.apiUrl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
});
afterAll(() => fake.close());

describe("UtmcapClient", () => {
  it("unwraps answers and lists every page", async () => {
    fake.addCampaign("Keto offer");
    expect((await client.listCampaigns()).map((c) => c.name)).toEqual(["Keto offer"]);
  });

  it("creates with an idempotency key: a retry gets the first answer", async () => {
    const one = await client.createTrafficSource({ name: "Sendcoop" }, "key-1");
    const again = await client.createTrafficSource({ name: "Sendcoop" }, "key-1");
    expect(again.id).toBe(one.id);
    expect(fake.sources).toHaveLength(1);
    expect(fake.requests.at(-1)?.idempotencyKey).toBe("key-1");
  });

  it("waits out a 429 for Retry-After and tries again", async () => {
    fake.rateLimitNext(2);
    sleeps.length = 0;
    expect(await client.listTrafficSources()).toHaveLength(1);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("turns error answers into UtmcapError with the code", async () => {
    const bad = new UtmcapClient({ apiKey: "utmk_wrong", baseUrl: fake.apiUrl });
    await expect(bad.listCampaigns()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    await expect(client.createTrafficSource({ name: "Sendcoop" })).rejects.toBeInstanceOf(
      UtmcapError,
    );
  });
});

describe("webhook signatures", () => {
  it("accepts UTMCAP's t=,v1= header and refuses changes and old ones", () => {
    const body = '{"id":"e1"}';
    const header = signUtmcapBody("whsec_x", body, 1_800_000_000);
    expect(verifyUtmcapSignature("whsec_x", body, header, 1_800_000_000_000)).toBe("ok");
    expect(verifyUtmcapSignature("whsec_x", `${body} `, header, 1_800_000_000_000)).toBe("invalid");
    expect(verifyUtmcapSignature("whsec_y", body, header, 1_800_000_000_000)).toBe("invalid");
    expect(verifyUtmcapSignature("whsec_x", body, header, 1_800_000_301_000)).toBe("expired");
    expect(verifyUtmcapSignature("whsec_x", body, undefined)).toBe("missing");
    expect(verifyUtmcapSignature("whsec_x", body, "t=1,v1=zz")).toBe("expired");
  });
});
