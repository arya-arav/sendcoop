import { describe, expect, it } from "vitest";
import { isAppleProxyIp, isBotUserAgent, isMachineOpen } from "./bot-detection";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

describe("isBotUserAgent", () => {
  it("lets real browsers through", () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
    expect(isBotUserAgent(IPHONE)).toBe(false);
  });

  it.each([
    "Mozilla/5.0 (compatible; Barracuda Sentinel)",
    "Mimecast-URL-Protect/1.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "WhatsApp/2.23.20.0",
    "facebookexternalhit/1.1",
    "python-requests/2.31",
    "curl/8.4.0",
    "Go-http-client/1.1",
    "Mozilla/5.0 (compatible; Googlebot/2.1)",
  ])("flags %s", (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it("treats a missing or near-empty user agent as a machine", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("Mozilla")).toBe(true);
  });
});

describe("machine opens", () => {
  it("are Apple's proxy (Mail Privacy Protection) and scanners", () => {
    expect(isAppleProxyIp("17.58.101.5")).toBe(true);
    expect(isAppleProxyIp("::ffff:17.0.0.1")).toBe(true);
    expect(isAppleProxyIp("2620:149:a0c:4000::1")).toBe(true);
    expect(isAppleProxyIp("170.1.2.3")).toBe(false);
    expect(isMachineOpen("17.58.101.5", "Mozilla/5.0")).toBe(true);
    expect(isMachineOpen("203.0.113.9", "Mimecast-URL-Protect/1.0")).toBe(true);
  });

  it("are not Gmail's image proxy, which fetches when someone opens the email", () => {
    expect(
      isMachineOpen(
        "66.249.84.1",
        "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
      ),
    ).toBe(false);
    expect(isMachineOpen("203.0.113.9", IPHONE)).toBe(false);
  });
});
