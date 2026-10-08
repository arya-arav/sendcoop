import { describe, expect, it } from "vitest";
import { compareTotals } from "./utmcap-reconcile";

describe("compareTotals", () => {
  it("lines UTMCAP's sub1 rows up with Sendcoop's campaigns, flagging differences", () => {
    const rows = compareTotals(
      [
        { key: "spring-sale", conversions: 3, revenue: 150 },
        { key: "keto-email", conversions: 2, revenue: 80 },
        { key: "", conversions: 1, revenue: 10 },
      ],
      [
        { campaign_id: "c1", campaign_name: "Spring Sale!", conversions: 3, revenue: 150 },
        { campaign_id: "c2", campaign_name: "Keto email", conversions: 1, revenue: 40 },
      ],
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: "spring-sale", campaignId: "c1", matches: true }),
      expect.objectContaining({
        key: "keto-email",
        utmcap: { conversions: 2, revenue: 80 },
        sendcoop: { conversions: 1, revenue: 40 },
        matches: false,
      }),
      expect.objectContaining({ key: "(no sub1)", campaignId: null, matches: false }),
    ]);
  });
});
