import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicOnly } from "./webhooks";

// DNS rebinding (D79): a name that passed the check can resolve to an
// internal address when the connection is made. The webhook agent checks
// the address it connects to, so a name for 127.0.0.1 never connects.

let server: Server;
let port: number;
let hits = 0;

beforeAll(async () => {
  delete process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS;
  server = createServer((_req, res) => {
    hits++;
    res.end("internal");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("webhook connections", () => {
  it("never connect to an internal address, whatever the name", async () => {
    await expect(fetch(`http://localhost:${port}/`, { dispatcher: publicOnly })).rejects.toThrow();
    expect(hits).toBe(0);
  });

  it("connect when tests allow local endpoints", async () => {
    process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS = "1";
    const response = await fetch(`http://localhost:${port}/`, { dispatcher: publicOnly });
    expect(await response.text()).toBe("internal");
    delete process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS;
  });
});
