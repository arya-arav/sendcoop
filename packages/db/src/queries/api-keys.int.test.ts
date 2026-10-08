import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "./api-keys";

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Keys', ${`int-keys-${run}`}) returning id`;
  ws = w!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

describe("API keys", () => {
  it("keeps only a hash, and authenticates the key until it's revoked", async () => {
    const { id, key } = await createApiKey(ws, "Server", null);
    const [stored] = await sql<{ key_hash: string; hint: string }[]>`
      select key_hash, hint from api_keys where id = ${id}`;
    expect(stored!.key_hash).not.toContain(key);
    expect(key.startsWith(stored!.hint)).toBe(true);

    expect(await authenticateApiKey(key)).toEqual({ id, workspaceId: ws });
    expect((await listApiKeys(ws))[0]!.lastUsedAt).not.toBeNull();
    expect(await authenticateApiKey(`${key}x`)).toBeNull();
    expect(await authenticateApiKey("Bearer nonsense")).toBeNull();

    expect(await revokeApiKey(ws, id)).toBe(true);
    expect(await authenticateApiKey(key)).toBeNull();
    expect(await listApiKeys(ws)).toEqual([]);
  });
});
