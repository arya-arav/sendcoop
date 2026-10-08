import { describe, expect, it } from "vitest";
import { classifyLink, normalizeDomain } from "./affiliate-networks";

describe("classifyLink", () => {
  it.each([
    ["https://vendor.hop.clickbank.net/?affiliate=me", "clickbank"],
    ["https://hop.clickbank.net/?affiliate=me&vendor=x", "clickbank"],
    ["https://www.digistore24.com/redir/12345/me/", "digistore24"],
    ["https://brand.sjv.io/c/123/456/789", "impact"],
    ["https://goto.target.com.pxf.io/abc", "impact"],
    ["https://www.anrdoezrs.net/click-123-456", "cj"],
    ["https://www.awin1.com/cread.php?awinmid=1&awinaffid=2", "awin"],
    ["https://shareasale.com/r.cfm?b=1&u=2&m=3", "shareasale"],
    ["https://afflat3e1.com/lnk.asp?o=1&c=2&a=3", "maxbounty"],
    ["https://network.go2cloud.org/aff_c?offer_id=7&aff_id=9", "tune"],
    ["https://www.trk-net.com/?oid=12&affid=34", "everflow"],
    ["https://www.amazon.com/dp/B0123?tag=me-20", "amazon"],
    ["https://amzn.to/3abc", "amazon"],
  ])("knows %s is %s", (url, network) => {
    expect(classifyLink(url)).toEqual({ isAffiliate: true, networkId: network });
  });

  it("uses the workspace's own affiliate domains, subdomains included", () => {
    expect(classifyLink("https://go.mypartner.com/offer", ["mypartner.com"])).toEqual({
      isAffiliate: true,
      networkId: "custom",
    });
    expect(classifyLink("https://notmypartner.com/x", ["mypartner.com"]).isAffiliate).toBe(false);
  });

  it("leaves ordinary links, Amazon without a tag, and bad URLs alone", () => {
    for (const url of [
      "https://example.com/blog",
      "https://www.amazon.com/dp/B0123",
      "not a url",
    ]) {
      expect(classifyLink(url)).toEqual({ isAffiliate: false, networkId: null });
    }
  });
});

describe("normalizeDomain", () => {
  it("accepts domains, URLs and www", () => {
    expect(normalizeDomain(" Shop.Example.com ")).toBe("shop.example.com");
    expect(normalizeDomain("https://www.example.com/path")).toBe("example.com");
    expect(normalizeDomain("")).toBe("");
  });
});
