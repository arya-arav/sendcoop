import { describe, expect, it } from "vitest";
import { getSql } from "../client";

// Database design rules that keep big accounts fast (D80).
describe("schema health", () => {
  it("indexes every foreign key, so deleting a parent never scans a whole table", async () => {
    const missing = await getSql()<{ fk: string }[]>`
      select c.conrelid::regclass || '.' || a.attname as fk
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1
        and not exists (
          select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`;
    expect(missing.map((m) => m.fk)).toEqual([]);
  });
});
