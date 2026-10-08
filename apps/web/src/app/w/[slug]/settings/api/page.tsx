import { getWorkspacePlan, listApiKeys } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appUrl } from "@/lib/app-url";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { NewApiKeyForm, RevokeApiKeyButton } from "./key-controls";

export const metadata: Metadata = { title: "API keys" };

const day = (d: Date) => d.toLocaleDateString("en-GB", { dateStyle: "medium" });

export default async function ApiKeysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const manager = canManage(role);
  const [keys, plan] = await Promise.all([
    manager ? listApiKeys(workspace.id) : [],
    getWorkspacePlan(workspace.id),
  ]);
  const base = `${appUrl()}/api/v1`;

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
        <h1 className="text-[22px] font-semibold">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Manage subscribers and conversions from your own code: the REST API at{" "}
          <code className="text-xs">{base}</code>, described in{" "}
          <a href="/api/v1/openapi.json" className="underline">
            openapi.json
          </a>
          .
        </p>
      </div>

      {!plan.features.api && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          The API isn&apos;t part of the {plan.plan.name} plan: keys made here only work once you
          upgrade in{" "}
          <Link href={`/w/${slug}/settings/billing`} className="underline">
            Billing
          </Link>
          .
        </p>
      )}

      {manager ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>New key</h2>
              </CardTitle>
              <CardDescription>
                Send it as <code className="text-xs">Authorization: Bearer &lt;key&gt;</code>. One
                key per tool, so you can revoke one without the others.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NewApiKeyForm slug={slug} />
            </CardContent>
          </Card>
          <Table aria-label="API keys">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No keys yet.
                  </TableCell>
                </TableRow>
              )}
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.hint}…</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {k.lastUsedAt ? day(k.lastUsedAt) : "Never"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {day(k.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RevokeApiKeyButton slug={slug} keyId={k.id} name={k.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Owners and admins manage API keys.</p>
      )}
    </div>
  );
}
