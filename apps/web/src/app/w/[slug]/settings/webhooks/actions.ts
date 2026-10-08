"use server";

import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getWorkspacePlan,
  listWebhookEndpoints,
  queueTestWebhook,
  setWebhookEndpointEnabled,
  WEBHOOK_EVENTS,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const NO_PERMISSION = "Only owners and admins can manage webhooks.";
const MAX_ENDPOINTS = 10;

async function managerWorkspace(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  return canManage(role) ? workspace : null;
}

const endpointSchema = z.object({
  url: z
    .url({ error: "Enter the full URL, starting with https://." })
    .max(2000)
    .refine(
      (u) =>
        u.startsWith("https://") ||
        // Tests call a local server; never set outside them.
        (process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS === "1" && u.startsWith("http://")),
      "Webhooks go to https:// addresses.",
    ),
  description: z.string().trim().max(200),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event."),
});

export async function addWebhookEndpointAction(
  slug: string,
  input: z.input<typeof endpointSchema>,
): Promise<Result> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  const plan = await getWorkspacePlan(workspace.id);
  if (!plan.features.api) {
    return { ok: false, error: `Webhooks aren't part of the ${plan.plan.name} plan.` };
  }
  const parsed = endpointSchema.safeParse({ ...input, url: input.url.trim() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if ((await listWebhookEndpoints(workspace.id)).length >= MAX_ENDPOINTS) {
    return { ok: false, error: `Up to ${MAX_ENDPOINTS} endpoints.` };
  }
  await createWebhookEndpoint(workspace.id, parsed.data);
  revalidatePath(`/w/${slug}/settings/webhooks`);
  return { ok: true, message: "Endpoint added." };
}

export async function deleteWebhookEndpointAction(
  slug: string,
  endpointId: string,
): Promise<Result> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  await deleteWebhookEndpoint(workspace.id, endpointId);
  revalidatePath(`/w/${slug}/settings/webhooks`);
  return { ok: true };
}

export async function setWebhookEndpointEnabledAction(
  slug: string,
  endpointId: string,
  enabled: boolean,
): Promise<Result> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  await setWebhookEndpointEnabled(workspace.id, endpointId, enabled);
  revalidatePath(`/w/${slug}/settings/webhooks`);
  return { ok: true };
}

export async function testWebhookEndpointAction(slug: string, endpointId: string): Promise<Result> {
  const workspace = await managerWorkspace(slug);
  if (!workspace) return { ok: false, error: NO_PERMISSION };
  if (!(await queueTestWebhook(workspace.id, endpointId))) {
    return { ok: false, error: "No such endpoint." };
  }
  revalidatePath(`/w/${slug}/settings/webhooks`);
  return { ok: true, message: "Test queued: it goes out within a few seconds." };
}
