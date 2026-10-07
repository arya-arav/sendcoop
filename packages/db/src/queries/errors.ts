/** True for a Postgres unique-constraint violation. Drizzle wraps driver
 * errors, so the code may be on the error or its cause. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
