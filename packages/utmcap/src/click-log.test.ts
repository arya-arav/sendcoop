import { describe, expect, it } from "vitest";
import { findScCid } from "./click-log";

describe("findScCid", () => {
  it("reads the external id from names or hops", () => {
    expect(findScCid({ names: { external_id: "sc4Fh9KqZ2LmPx7Ty1" } })).toBe("sc4Fh9KqZ2LmPx7Ty1");
    expect(
      findScCid({ hops: [{ type: "click", query: { sc_cid: "sc4Fh9KqZ2LmPx7Ty1", sub1: "x" } }] }),
    ).toBe("sc4Fh9KqZ2LmPx7Ty1");
  });

  it("falls back to the incoming URL", () => {
    expect(
      findScCid({ hops: [{ url: "https://t.example/abc?sub1=x&sc_cid=scAAAAAAAAAAAAAAAA" }] }),
    ).toBe("scAAAAAAAAAAAAAAAA");
  });

  it("ignores values that aren't Sendcoop click ids", () => {
    expect(findScCid({ names: { external_id: "fb.1.123" }, hops: [] })).toBeNull();
    expect(findScCid(null)).toBeNull();
  });
});
