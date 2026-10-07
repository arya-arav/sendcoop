import { listUserWorkspaces } from "@sendcoop/db";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { requireSession } from "@/lib/session";
import { WorkspaceForm } from "@/components/workspace-form";

export default async function OnboardingPage() {
  const { user } = await requireSession();
  // Extra workspaces are created from the workspace switcher (D5), not here.
  const existing = await listUserWorkspaces(user.id);
  if (existing.length > 0) redirect(`/w/${existing[0]!.slug}`);

  return (
    <AuthCard
      title="Create your workspace"
      subtitle="A workspace holds your lists, campaigns and revenue reports. You can invite your team later."
    >
      <WorkspaceForm suggestedName={`${user.name.split(" ")[0]}'s workspace`} />
    </AuthCard>
  );
}
