import { describe, expect, it } from "vitest";
import { classifyLink } from "./affiliate-networks";
import { type DestinationOptions, decorateDestination, slugForUtm } from "./destination";

const base: Omit<DestinationOptions, "networkId"> = {
  clickId: "sc4Fh9KqZ2LmPx7Ty1",
  campaignName: "Autumn Sale: 40% off!",
  label: "Shop now",
  position: 0,
  addUtm: true,
  utmSource: "sendcoop",
};

/** As the click redirect does: classify the link, then decorate it. */
const destination = (url: string, options: Partial<typeof base> = {}) =>
  decorateDestination(url, { ...base, ...options, networkId: classifyLink(url).networkId });

describe("affiliate links get the click id in the network's sub-id", () => {
  it("ClickBank: tid, and nothing else added", () => {
    expect(destination("https://vendor.hop.clickbank.net/?affiliate=myaff")).toBe(
      "https://vendor.hop.clickbank.net/?affiliate=myaff&tid=sc4Fh9KqZ2LmPx7Ty1",
    );
    // An existing tid is replaced: the postback needs ours.
    expect(destination("https://hop.clickbank.net/?affiliate=me&vendor=v&tid=newsletter")).toBe(
      "https://hop.clickbank.net/?affiliate=me&vendor=v&tid=sc4Fh9KqZ2LmPx7Ty1",
    );
  });

  it("Impact: subId1, keeping the path and other parameters", () => {
    expect(
      destination("https://brand.sjv.io/c/1234/567890/12345?u=https%3A%2F%2Fbrand.test%2Fp"),
    ).toBe(
      "https://brand.sjv.io/c/1234/567890/12345?u=https%3A%2F%2Fbrand.test%2Fp&subId1=sc4Fh9KqZ2LmPx7Ty1",
    );
  });

  it("other networks use their own parameter", () => {
    expect(destination("https://www.amazon.com/dp/B0123?tag=me-20")).toBe(
      "https://www.amazon.com/dp/B0123?tag=me-20&ascsubtag=sc4Fh9KqZ2LmPx7Ty1",
    );
    expect(destination("https://www.awin1.com/cread.php?awinmid=1&awinaffid=2")).toContain(
      "&clickref=sc4Fh9KqZ2LmPx7Ty1",
    );
  });
});

describe("other links get UTM tags and sc_cid", () => {
  it("adds utm_* and sc_cid, keeping the anchor", () => {
    expect(destination("https://shop.test/sale?color=red#top")).toBe(
      "https://shop.test/sale?color=red&utm_source=sendcoop&utm_medium=email&utm_campaign=autumn-sale-40-off&utm_content=shop-now&sc_cid=sc4Fh9KqZ2LmPx7Ty1#top",
    );
  });

  it("keeps UTM tags the link already has", () => {
    expect(destination("https://shop.test/?utm_source=partner&utm_campaign=x")).toBe(
      "https://shop.test/?utm_source=partner&utm_campaign=x&utm_medium=email&utm_content=shop-now&sc_cid=sc4Fh9KqZ2LmPx7Ty1",
    );
  });

  it("can skip UTM tags; links without text are numbered", () => {
    expect(destination("https://shop.test/", { addUtm: false })).toBe(
      "https://shop.test/?sc_cid=sc4Fh9KqZ2LmPx7Ty1",
    );
    expect(destination("https://shop.test/", { label: null, position: 2 })).toContain(
      "utm_content=link-3",
    );
  });
});

describe("slugForUtm", () => {
  it("makes short, readable, URL-safe values", () => {
    expect(slugForUtm("Café Réouverture — Été 2026")).toBe("cafe-reouverture-ete-2026");
    expect(slugForUtm("!!!")).toBe("email");
  });
});

describe("UTMCAP campaign links (D57)", () => {
  const options = {
    clickId: "sc4Fh9KqZ2LmPx7Ty1",
    networkId: "utmcap",
    campaignName: "Spring Sale!",
    label: "Shop now",
    position: 0,
    addUtm: true,
    utmSource: "newsletter",
    audience: "Keto buyers",
  };

  it("carry sc_cid and sub1-4, and no UTM tags", () => {
    const url = new URL(decorateDestination("https://trk.example.com/abc123?lp=2", options));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lp: "2",
      sc_cid: "sc4Fh9KqZ2LmPx7Ty1",
      sub1: "spring-sale",
      sub3: "keto-buyers",
      sub4: "shop-now",
    });
  });

  it("name the link by position without a label, and leave out what isn't known", () => {
    const url = new URL(
      decorateDestination("https://trk.example.com/abc123", {
        ...options,
        label: null,
        position: 2,
        audience: null,
      }),
    );
    expect(url.searchParams.get("sub4")).toBe("link-3");
    expect(url.searchParams.has("sub3")).toBe(false);
    expect(url.searchParams.has("sub2")).toBe(false);
  });
});
