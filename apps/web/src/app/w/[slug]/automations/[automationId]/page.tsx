import {
  getAutomation,
  listCampaigns,
  listCustomFields,
  listLists,
  listSegments,
  listTags,
} from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { FlowBuilder } from "./flow-builder";

export const metadata: Metadata = { title: "Automation" };

export default async function AutomationPage({
  params,
}: {
  params: Promise<{ slug: string; automationId: string }>;
}) {
  const { slug, automationId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) notFound();
  const automation = await getAutomation(workspace.id, automationId);
  if (!automation) notFound();
  const [lists, tags, segments, campaigns, fields] = await Promise.all([
    listLists(workspace.id),
    listTags(workspace.id),
    listSegments(workspace.id),
    listCampaigns(workspace.id),
    listCustomFields(workspace.id),
  ]);
  const options = (rows: { id: string; name: string }[]) =>
    rows.map(({ id, name }) => ({ id, name }));

  return (
    <FlowBuilder
      slug={slug}
      automationId={automation.id}
      initialName={automation.name}
      initialTrigger={automation.trigger}
      initialGraph={automation.graph}
      status={automation.status}
      context={{
        lists: options(lists),
        tags: options(tags),
        segments: options(segments),
        campaigns: options(campaigns.filter((c) => c.status !== "draft")),
        fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
      }}
    />
  );
}
