/** A path on this site to continue to after logging in, or undefined (no open redirects). */
export function safeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return undefined;
  }
  return next.slice(0, 500);
}
