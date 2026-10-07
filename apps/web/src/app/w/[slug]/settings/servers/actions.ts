"use server";

import {
  createSendingServer,
  deleteSendingServer,
  getDkimSigningKey,
  getSendingServerConfig,
  listSendingDomains,
  updateSendingServer,
} from "@sendcoop/db";
import {
  buildRawMessage,
  createDriver,
  type ServerConfig,
  serverConfigSchema,
  serverSummary,
  smtpHostProblem,
} from "@sendcoop/mailer";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { withinRateLimit } from "@/lib/rate-limit";
import { requireMemberWorkspace } from "@/lib/workspace";

export type ServerForm = {
  name: string;
  type: "smtp" | "ses";
  host: string;
  port: string;
  secure: boolean;
  username: string;
  /** Blank when editing means "keep the saved one". */
  password: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Blank means no limit. */
  maxPerSecond: string;
  maxPerHour: string;
  maxPerDay: string;
};

/** "" -> no limit; otherwise a whole number from 1 to 1,000,000. */
function parseLimit(value: string, label: string): number | null | { error: string } {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
    return { error: `${label} must be a whole number above 0, or blank for no limit.` };
  }
  return n;
}

export type ServerResult = { ok: true; id: string } | { ok: false; error: string };

const NO_PERMISSION = "Only workspace owners and admins can change sending servers.";

async function manager(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  return canManage(role) ? workspace : null;
}

export async function saveServerAction(
  slug: string,
  serverId: string | null,
  form: ServerForm,
): Promise<ServerResult> {
  const workspace = await manager(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  const name = String(form.name ?? "")
    .trim()
    .slice(0, 100);
  if (!name) return { ok: false, error: "Give the server a name." };
  if (serverId && !z.uuid().safeParse(serverId).success) {
    return { ok: false, error: "This server no longer exists." };
  }

  // Editing: blank secrets keep the saved ones, so they never have to be shown.
  const saved = serverId ? await getSendingServerConfig(workspace.id, serverId) : null;
  if (serverId && !saved) return { ok: false, error: "This server no longer exists." };
  const keep = (field: string) => (saved?.config[field] as string | undefined) ?? "";
  const type = saved?.type ?? form.type;

  const candidate =
    type === "smtp"
      ? {
          type,
          host: form.host,
          port: Number(form.port),
          secure: Boolean(form.secure),
          username: form.username.trim() || undefined,
          password: form.password || (form.username.trim() ? keep("password") : undefined),
        }
      : {
          type,
          region: form.region.trim(),
          accessKeyId: form.accessKeyId.trim(),
          secretAccessKey: form.secretAccessKey || keep("secretAccessKey"),
        };
  const parsed = serverConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, error: `${issue.path.join(".") || "Settings"}: ${issue.message}` };
  }
  const config = parsed.data as ServerConfig;
  if (config.type === "smtp") {
    const problem = await smtpHostProblem(config.host);
    if (problem) return { ok: false, error: problem };
  }

  const limits = {
    maxPerSecond: parseLimit(form.maxPerSecond, "Emails per second"),
    maxPerHour: parseLimit(form.maxPerHour, "Emails per hour"),
    maxPerDay: parseLimit(form.maxPerDay, "Emails per day"),
  };
  for (const value of Object.values(limits)) {
    if (value !== null && typeof value === "object") return { ok: false, error: value.error };
  }

  const input = {
    name,
    summary: serverSummary(config),
    config,
    limits: limits as {
      maxPerSecond: number | null;
      maxPerHour: number | null;
      maxPerDay: number | null;
    },
  };
  const row = serverId
    ? await updateSendingServer(workspace.id, serverId, input)
    : await createSendingServer(workspace.id, { ...input, type: config.type });
  if (!row) return { ok: false, error: "This server no longer exists." };

  revalidatePath(`/w/${slug}/settings/servers`);
  return { ok: true, id: row.id };
}

export async function deleteServerAction(slug: string, serverId: string) {
  const workspace = await manager(slug);
  if (!workspace || !z.uuid().safeParse(serverId).success) return { ok: false } as const;
  const deleted = await deleteSendingServer(workspace.id, serverId);
  revalidatePath(`/w/${slug}/settings/servers`);
  return { ok: deleted } as const;
}

export type TestResult = { ok: true; message: string } | { ok: false; error: string };

const testInput = z.object({
  to: z.string().trim().pipe(z.email("Enter the address to send the test to.")),
  fromLocal: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._+-]{1,64}$/, "Enter the part before @, like news."),
  domainId: z.uuid("Choose a sending domain."),
});

/** Sends a DKIM-signed test email through the server and reports the provider's answer. */
export async function sendTestEmailAction(
  slug: string,
  serverId: string,
  input: z.input<typeof testInput>,
): Promise<TestResult> {
  const workspace = await manager(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  const parsed = testInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if (!(await withinRateLimit(`test-email:${workspace.id}`, 20, 3600))) {
    return { ok: false, error: "That's a lot of test emails. Try again in an hour." };
  }

  const domain = (await listSendingDomains(workspace.id)).find(
    (d) => d.id === parsed.data.domainId,
  );
  if (!domain) return { ok: false, error: "Choose one of this workspace's sending domains." };
  const stored = await getSendingServerConfig(workspace.id, serverId);
  if (!stored) return { ok: false, error: "This server no longer exists." };
  const config = serverConfigSchema.safeParse(stored.config);
  if (!config.success)
    return { ok: false, error: "This server's settings are incomplete. Edit and save it." };

  const from = `${parsed.data.fromLocal}@${domain.domain}`;
  const key = await getDkimSigningKey(workspace.id, domain.domain);
  const raw = await buildRawMessage(
    {
      from: { email: from, name: workspace.name },
      to: parsed.data.to,
      subject: `Test email from ${workspace.name}`,
      text: `This is a test from Sendcoop, sent through your sending server.\n\nIf you're reading it, sending works.`,
      html: `<p>This is a test from <strong>Sendcoop</strong>, sent through your sending server.</p><p>If you're reading it, sending works.</p>`,
    },
    key
      ? { domainName: domain.domain, keySelector: key.selector, privateKey: key.privateKeyPem }
      : undefined,
  );

  const driver = createDriver(config.data as ServerConfig);
  try {
    await driver.send(raw, { from, to: [parsed.data.to] });
    return { ok: true, message: `Sent to ${parsed.data.to}. Check that inbox (and spam).` };
  } catch (error) {
    // The provider's own explanation is the most useful thing to show.
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `The server refused the email: ${reason.slice(0, 300)}` };
  } finally {
    driver.close();
  }
}
