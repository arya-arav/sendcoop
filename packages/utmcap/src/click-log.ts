// Finding Sendcoop's click id in UTMCAP's answer for one click
// (GET /logs/clicks/{clickId}): it's the Sendcoop source's external id, and
// it was on the incoming URL as sc_cid. The answer's hops and names are
// loosely typed, so this looks everywhere it could be.

const CLICK_ID = /^sc[A-Za-z0-9]{16}$/;

export function findScCid(click: unknown): string | null {
  const seen = new Set<unknown>();
  let fromUrl: string | null = null;
  const walk = (value: unknown, key: string | null): string | null => {
    if (typeof value === "string") {
      if (key && /^(sc_cid|external_id|external|src_clid)$/i.test(key) && CLICK_ID.test(value)) {
        return value;
      }
      const inUrl = value.match(/[?&]sc_cid=(sc[A-Za-z0-9]{16})(?:&|$)/);
      if (inUrl) fromUrl ??= inUrl[1]!;
      return null;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) {
      const found = walk(v, k);
      if (found) return found;
    }
    return null;
  };
  return walk(click, null) ?? fromUrl;
}
