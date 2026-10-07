import { getSendingServer, getSendingServerConfig, listSendingDomains } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { ServerEditor, TestEmailPanel } from "../server-editor";
import { DeleteServerButton } from "./delete-server";

export default async function ServerPage({
  params,
}: {
  params: Promise<{ slug: string; serverId: string }>;
}) {
  const { slug, serverId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role) || !z.uuid().safeParse(serverId).success) notFound();
  const [server, stored, domains] = await Promise.all([
    getSendingServer(workspace.id, serverId),
    getSendingServerConfig(workspace.id, serverId),
    listSendingDomains(workspace.id),
  ]);
  if (!server || !stored) notFound();
  const c = stored.config as Record<string, string | number | boolean | undefined>;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <Link
        href={`/w/${slug}/settings/servers`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Sending servers
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
      <ServerEditor
        slug={slug}
        serverId={server.id}
        // Secrets are never sent to the browser.
        initial={{
          name: server.name,
          type: server.type,
          host: String(c.host ?? ""),
          port: String(c.port ?? "587"),
          secure: Boolean(c.secure),
          username: String(c.username ?? ""),
          password: "",
          region: String(c.region ?? ""),
          accessKeyId: String(c.accessKeyId ?? ""),
          secretAccessKey: "",
        }}
      />
      <TestEmailPanel
        slug={slug}
        serverId={server.id}
        domains={domains.map(({ id, domain }) => ({ id, domain }))}
      />
      <div>
        <DeleteServerButton slug={slug} id={server.id} name={server.name} />
      </div>
    </div>
  );
}
