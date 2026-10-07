/** URL-safe workspace slug: "Crème Brûlée Co." -> "creme-brulee-co". */
export function slugify(name: string, maxLength = 40): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // drop accents split off by NFKD
      .replace(/ß/g, "ss") // ß has no NFKD decomposition
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, maxLength)
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

/** Slug candidates: the plain slug first, then with a short random suffix. */
export function slugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
