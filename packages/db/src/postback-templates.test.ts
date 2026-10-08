import { describe, expect, it } from "vitest";
import { AFFILIATE_NETWORKS } from "./affiliate-networks";
import { parsePostback } from "./postback-params";
import { POSTBACK_TEMPLATES, postbackUrl } from "./postback-templates";

const BASE = "https://t.sendcoop.test";
const KEY = "pk_TESTKEY";

const urlFor = (id: string) => {
  const template = POSTBACK_TEMPLATES.find((t) => t.id === id)!;
  return postbackUrl(BASE, KEY, { id, macros: template.macros! });
};

describe("network postback URLs", () => {
  it.each([
    [
      "clickbank",
      "https://t.sendcoop.test/pb?key=pk_TESTKEY&cid={tid}&payout={affiliate_earnings}&txid={receipt_id}&status={event_type}&network=clickbank",
    ],
    [
      "digistore24",
      "https://t.sendcoop.test/pb?key=pk_TESTKEY&cid={sid1}&payout={amount_affiliate}&txid={transaction_id}&status={transaction_type}&currency={currency}&network=digistore24",
    ],
    [
      "impact",
      "https://t.sendcoop.test/pb?key=pk_TESTKEY&cid={SubId1}&payout={Payout}&txid={ActionId}&status={Status}&currency={Currency}&network=impact",
    ],
    [
      "awin",
      "https://t.sendcoop.test/pb?key=pk_TESTKEY&cid=!!!clickRef!!!&payout=!!!commission!!!&txid=!!!transactionId!!!&currency=!!!transactionCurrency!!!&network=awin",
    ],
    [
      "everflow",
      "https://t.sendcoop.test/pb?key=pk_TESTKEY&cid={sub1}&payout={payout_amount}&txid={transaction_id}&currency={currency}&network=everflow",
    ],
    [
      "tune",
      "https://t.sendcoop.test/pb?key=pk_TESTKEY&cid={aff_sub}&payout={payout}&txid={transaction_id}&currency={currency}&network=tune",
    ],
    [
      "maxbounty",
      "https://t.sendcoop.test/pb?key=pk_TESTKEY&cid=#S1#&payout=#RATE#&txid=#LEADID#&network=maxbounty",
    ],
  ])("%s", (id, expected) => {
    expect(urlFor(id)).toBe(expected);
  });

  it("CJ has no postback, and says what happens instead", () => {
    const cj = POSTBACK_TEMPLATES.find((t) => t.id === "cj")!;
    expect(cj.macros).toBeNull();
    expect(cj.instructions).toMatch(/API/);
  });

  it("covers every known network, each sub-id macro matching the link's sub-id parameter", () => {
    expect(POSTBACK_TEMPLATES.map((t) => t.id).sort()).toEqual(
      AFFILIATE_NETWORKS.map((n) => n.id)
        .filter((id) => id !== "amazon") // Amazon Associates has no postbacks
        .sort(),
    );
    for (const template of POSTBACK_TEMPLATES) {
      if (!template.macros) continue;
      const param = AFFILIATE_NETWORKS.find((n) => n.id === template.id)!.subidParam;
      expect(template.macros.cid.replace(/[{}!#]/g, "").toLowerCase()).toBe(param.toLowerCase());
    }
  });

  it("round-trips: filled in by the network, our endpoint reads the right values", () => {
    for (const template of POSTBACK_TEMPLATES) {
      if (!template.macros) continue;
      let url = urlFor(template.id)
        .replace(template.macros.cid, "sc4Fh9KqZ2LmPx7Ty1")
        .replace(template.macros.payout, "12.34")
        .replace(template.macros.txid, `TX-${template.id}`);
      if (template.macros.status) url = url.replace(template.macros.status, "RFND");
      if (template.macros.currency) url = url.replace(template.macros.currency, "EUR");
      const params = Object.fromEntries(new URL(url).searchParams);
      expect(parsePostback(params)).toMatchObject({
        clickId: "sc4Fh9KqZ2LmPx7Ty1",
        value: 12.34,
        txid: `TX-${template.id}`,
        status: template.macros.status ? "reversed" : "approved",
        currency: template.macros.currency ? "EUR" : "USD",
        network: template.id,
      });
    }
  });

  it("treats macros a network left unfilled as missing", () => {
    const params = Object.fromEntries(new URL(urlFor("awin")).searchParams);
    expect(parsePostback(params)).toMatchObject({ clickId: null, txid: null, value: 0 });
  });
});
