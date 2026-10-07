/** Makes % and _ in user input match literally in LIKE patterns. */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}
