import {
  addSendingDomain,
  getSendingDomain,
  getSql,
  systemTxtLookup,
  verifyDueDomains,
} from "@sendcoop/db";
import dns2 from "dns2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the scheduled domain check against a real DNS server on localhost, so
// the whole path is exercised: our resolver, record parsing and status changes.

const sql = getSql();
const records = new Map<string, string[]>();
let server: ReturnType<typeof dns2.createServer>;
let ws: string;

beforeAll(async () => {
  server = dns2.createServer({
    udp: true,
    handle: (request, send) => {
      const response = dns2.Packet.createResponseFromRequest(request);
      const [question] = request.questions;
      for (const value of records.get(question!.name.toLowerCase()) ?? []) {
        // Real DNS splits long TXT values into 255-byte strings; do the same.
        const chunks = value.match(/.{1,255}/g) ?? [""];
        response.answers.push({
          name: question!.name,
          type: dns2.Packet.TYPE.TXT,
          class: dns2.Packet.CLASS.IN,
          ttl: 60,
          data: chunks,
        } as never);
      }
      send(response);
    },
  });
  await server.listen({ udp: { port: 0, address: "127.0.0.1" } });
  const { udp } = server.addresses() as { udp: { port: number } };
  process.env.DNS_SERVERS = `127.0.0.1:${udp.port}`;

  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('DNS', ${`int-dns-${Date.now().toString(36)}`}) returning id`;
  ws = row!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await server.close();
  await sql.end();
});

describe("scheduled domain verification", () => {
  it("flips a domain to verified once its records appear", async () => {
    const added = await addSendingDomain(ws, "mail.dns-test.example");
    if (!added.ok) throw new Error("setup");
    const domain = added.domain;
    const start = new Date();

    // Nothing published yet: checked, still pending.
    await verifyDueDomains(systemTxtLookup(), start);
    expect(await getSendingDomain(ws, domain.id)).toMatchObject({
      status: "pending",
      spfVerified: false,
      dkimVerified: false,
    });

    // The customer publishes the records.
    records.set("mail.dns-test.example", ["v=spf1 include:amazonses.com ~all"]);
    records.set(`${domain.dkimSelector}._domainkey.mail.dns-test.example`, [
      `v=DKIM1; k=rsa; p=${domain.dkimPublicKey}`,
    ]);
    records.set("_dmarc.mail.dns-test.example", ["v=DMARC1; p=none"]);

    // Checked again only after 10 minutes.
    const soon = new Date(start.getTime() + 60_000);
    expect((await verifyDueDomains(systemTxtLookup(), soon)).checked).toBe(0);

    const later = new Date(start.getTime() + 11 * 60_000);
    const result = await verifyDueDomains(systemTxtLookup(), later);
    expect(result.verified).toBe(1);
    const verified = await getSendingDomain(ws, domain.id);
    expect(verified).toMatchObject({
      status: "verified",
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
    });
    expect(verified?.verifiedAt).toEqual(later);

    // Removing a record later is noticed on the daily re-check.
    records.delete("_dmarc.mail.dns-test.example");
    const nextDay = new Date(later.getTime() + 25 * 3_600_000);
    await verifyDueDomains(systemTxtLookup(), nextDay);
    expect(await getSendingDomain(ws, domain.id)).toMatchObject({
      status: "failed",
      dmarcVerified: false,
    });
  });
});
