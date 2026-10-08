import { ECB_DAILY_URL, parseEcbRates, storeFxRates } from "@sendcoop/db";

/**
 * Loads the ECB's daily reference rates and converts conversions that were
 * waiting for one (a maintenance job). FX_RATES_URL=off turns it off (tests
 * load their own rates); another URL is fetched instead of the ECB's.
 */
export async function refreshFxRates(fetchImpl: typeof fetch = fetch) {
  const url = process.env.FX_RATES_URL ?? ECB_DAILY_URL;
  if (url === "off") return null;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`FX rates: ${response.status} from ${url}`);
  const parsed = parseEcbRates(await response.text());
  if (!parsed) throw new Error(`FX rates: ${url} didn't return ECB reference rates`);
  return { day: parsed.day, ...(await storeFxRates(parsed.day, parsed.rates)) };
}
