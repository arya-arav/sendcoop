import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conversionApiCurl } from "./conversion-api-example";

describe("conversion API curl example", () => {
  it("is the one in the docs", () => {
    const docs = readFileSync(
      new URL("../../../../docs/conversion-api.md", import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const block = docs.match(/## Example\n\n```bash\n([^]*?)\n```/)?.[1];
    expect(block).toBe(
      conversionApiCurl({
        trackingUrl: "https://<your tracking domain>",
        workspaceId: "<workspace id>",
        secret: "<API secret>",
      }),
    );
  });
});
