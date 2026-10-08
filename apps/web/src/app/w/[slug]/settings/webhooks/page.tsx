import { getWorkspacePlan, listWebhookEndpoints, recentWebhookDeliveries } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { AddEndpointForm, EndpointControls, EVENT_LABELS } from "./endpoint-controls";

export const metadata: Metadata = { title: "Webhooks" };

const time = (d: Date) =>
  d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function WebhooksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const manager = canManage(role);
  const [endpoints, deliveries, plan] = await Promise.all([
    listWebhookEndpoints(workspace.id),
    recentWebhookDeliveries(workspace.id),
    getWorkspacePlan(workspace.id),
  ]);
  const urlOf = new Map(endpoints.map((e) => [e.id, e.url]));

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/settings`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Settings
      </Link>
      <div>
        <h1 className="text-[22px] font-semibold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Sendcoop POSTs JSON to your endpoints when these things happen, signed with the webhook
          secret on the{" "}
          <Link href={`/w/${slug}/integrations`} className="underline">
            Integrations
          </Link>{" "}
          page. Failed deliveries are retried for about 8 hours.
        </p>
      </div>

      {manager && plan.features.api && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Add an endpoint</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AddEndpointForm slug={slug} />
          </CardContent>
        </Card>
      )}
      {!plan.features.api && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Webhooks aren&apos;t part of the {plan.plan.name} plan.{" "}
          <Link href={`/w/${slug}/settings/billing`} className="underline">
            See the plans
          </Link>
          .
        </p>
      )}

      <Table aria-label="Endpoints">
        <TableHeader>
          <TableRow>
            <TableHead>Endpoint</TableHead>
            <TableHead>Events</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {endpoints.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No endpoints yet.
              </TableCell>
            </TableRow>
          )}
          {endpoints.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="max-w-xs">
                <span className="block truncate font-mono text-xs">{e.url}</span>
                {e.description && (
                  <span className="block text-xs text-muted-foreground">{e.description}</span>
                )}
                {!e.enabled && (
                  <Badge variant="outline" className="mt-1">
                    Off{e.disabledReason ? `: ${e.disabledReason}` : ""}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs">
                {e.events.map((ev) => EVENT_LABELS[ev]).join(", ")}
              </TableCell>
              <TableCell>
                {manager && (
                  <EndpointControls slug={slug} endpointId={e.id} url={e.url} enabled={e.enabled} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Recent deliveries</h2>
          </CardTitle>
          <CardDescription>The last 30, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Deliveries">
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>When (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nothing sent yet.
                  </TableCell>
                </TableRow>
              )}
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.event}</TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-xs">
                    {urlOf.get(d.endpointId)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.status === "delivered"
                      ? `Delivered (${d.responseStatus})`
                      : d.status === "failed"
                        ? `Failed after ${d.attempts} tries${d.error ? `: ${d.error}` : d.responseStatus ? ` (${d.responseStatus})` : ""}`
                        : d.attempts > 0
                          ? `Retrying (${d.attempts} ${d.attempts === 1 ? "try" : "tries"} so far)`
                          : "Waiting"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {time(d.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
