import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { getOpenInvitation, listPendingInvitations, listTeam, teamSeatsUsed } from "./team";

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let owner: string;
let open: string;

beforeAll(async () => {
  const [u] = await sql<{ id: string }[]>`
    insert into users (name, email) values ('Team owner', ${`team-${run}@example.com`}) returning id`;
  owner = u!.id;
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Team', ${`int-team-${run}`}) returning id`;
  ws = w!.id;
  await sql`insert into memberships (workspace_id, user_id, role) values (${ws}, ${owner}, 'owner')`;
  const invites = await sql<{ id: string }[]>`
    insert into invitations (workspace_id, email, role, status, inviter_id, expires_at)
    values (${ws}, 'open@example.com', 'member', 'pending', ${owner}, now() + interval '1 day'),
           (${ws}, 'late@example.com', 'member', 'pending', ${owner}, now() - interval '1 day'),
           (${ws}, 'done@example.com', 'admin', 'accepted', ${owner}, now() + interval '1 day')
    returning id`;
  open = invites[0]!.id;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql`delete from users where id = ${owner}`;
});

describe("team", () => {
  it("counts members and open invitations as seats", async () => {
    expect((await listTeam(ws)).map((m) => m.role)).toEqual(["owner"]);
    expect((await listPendingInvitations(ws)).map((i) => i.email)).toEqual(["open@example.com"]);
    expect(await teamSeatsUsed(ws)).toBe(2);
  });

  it("finds only open invitations", async () => {
    expect((await getOpenInvitation(open))?.workspaceName).toBe("Team");
    const [late] = await sql<{ id: string }[]>`
      select id from invitations where email = 'late@example.com' and workspace_id = ${ws}`;
    expect(await getOpenInvitation(late!.id)).toBeNull();
    expect(await getOpenInvitation("not-an-id")).toBeNull();
  });
});
