import { getWorkspacePlan, listPendingInvitations, listTeam } from "@sendcoop/db";
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
import { CancelInvitationButton, InviteForm, MemberControls, ROLE_LABELS } from "./team-controls";

export const metadata: Metadata = { title: "Team" };

const roleLabel = (role: string) =>
  role
    .split(",")
    .map((r) => ROLE_LABELS[r.trim()] ?? r)
    .join(", ");

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, role } = await requireMemberWorkspace(slug);
  const manager = canManage(role);
  const [team, invitations, plan] = await Promise.all([
    listTeam(workspace.id),
    manager ? listPendingInvitations(workspace.id) : [],
    getWorkspacePlan(workspace.id),
  ]);
  const limit = plan.limits.teamMembers;
  const seats = team.length + invitations.length;

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
        <h1 className="text-[22px] font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">
          Owners and admins change anything. Members see contacts, campaigns and reports, but
          can&apos;t change them. Only the owner manages billing.
        </p>
      </div>

      {manager && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Invite someone</h2>
            </CardTitle>
            <CardDescription>
              {limit === null
                ? "Your plan has no limit on team members."
                : `${seats} of ${limit} ${limit === 1 ? "place" : "places"} used on your ${plan.plan.name} plan, invitations included.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm slug={slug} />
          </CardContent>
        </Card>
      )}

      <Table aria-label="Team members">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {team.map((m) => {
            const isOwner = m.role.split(",").includes("owner");
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <span className="font-medium">{m.name}</span>
                  {m.userId === user.id && (
                    <Badge variant="outline" className="ml-2">
                      You
                    </Badge>
                  )}
                  <span className="block text-xs text-muted-foreground">{m.email}</span>
                </TableCell>
                <TableCell>{roleLabel(m.role)}</TableCell>
                <TableCell className="text-right">
                  {manager && !isOwner && m.userId !== user.id && (
                    <MemberControls slug={slug} memberId={m.id} name={m.name} role={m.role} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {invitations.map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                <span className="text-muted-foreground">{i.email}</span>
                <Badge variant="secondary" className="ml-2">
                  Invited
                </Badge>
              </TableCell>
              <TableCell>{roleLabel(i.role ?? "member")}</TableCell>
              <TableCell className="text-right">
                <CancelInvitationButton slug={slug} invitationId={i.id} email={i.email} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
