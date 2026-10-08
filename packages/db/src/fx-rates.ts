// The ECB's daily euro reference rates (about 30 currencies, published on
// working days around 16:00 CET), free and without a key:
// https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** The day and rates (per euro) in the ECB's XML; null if it isn't that file. */
export function parseEcbRates(xml: string): { day: string; rates: Record<string, number> } | null {
  const day = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!day) return null;
  const rates: Record<string, number> = {};
  for (const match of xml.matchAll(
    /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g,
  )) {
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) rates[match[1]!] = rate;
  }
  return Object.keys(rates).length > 0 ? { day, rates } : null;
}
