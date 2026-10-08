import { getSql } from "@sendcoop/db";
import { afterAll, describe, expect, it } from "vitest";
import { refreshFxRates } from "./fx-rates";

const sql = getSql();
const DAY = "2001-02-01";
const xml = `<Cube><Cube time='${DAY}'><Cube currency='USD' rate='1.2'/><Cube currency='SEK' rate='11.5'/></Cube></Cube>`;
const fakeFetch = (async () => new Response(xml)) as typeof fetch;

afterAll(async () => {
  await sql`delete from fx_rates where day = ${DAY}`;
  await sql.end();
});

describe("refreshFxRates", () => {
  it("stores the ECB's rates for their day", async () => {
    const old = process.env.FX_RATES_URL;
    process.env.FX_RATES_URL = "https://rates.example/eurofxref-daily.xml";
    try {
      expect(await refreshFxRates(fakeFetch)).toMatchObject({ day: DAY, stored: 2 });
    } finally {
      process.env.FX_RATES_URL = old;
    }
    const rows = await sql<{ currency: string; per_eur: number }[]>`
      select currency, per_eur::float8 as per_eur from fx_rates where day = ${DAY} order by currency`;
    expect(rows).toEqual([
      { currency: "SEK", per_eur: 11.5 },
      { currency: "USD", per_eur: 1.2 },
    ]);
  });

  it("can be turned off, and refuses pages that aren't rates", async () => {
    const old = process.env.FX_RATES_URL;
    try {
      process.env.FX_RATES_URL = "off";
      expect(await refreshFxRates(fakeFetch)).toBeNull();
      process.env.FX_RATES_URL = "https://rates.example/";
      await expect(
        refreshFxRates((async () => new Response("<html>down</html>")) as typeof fetch),
      ).rejects.toThrow(/didn't return ECB reference rates/);
    } finally {
      process.env.FX_RATES_URL = old;
    }
  });
});
