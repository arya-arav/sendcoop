import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { WorkspaceForm } from "@/components/workspace-form";
import { requireSession } from "@/lib/session";

export default async function NewWorkspacePage() {
  await requireSession();

  return (
    <AuthCard
      title="Create a workspace"
      subtitle="Each workspace has its own contacts, campaigns and reports."
      footer={
        <Link href="/" className="font-medium underline">
          Cancel
        </Link>
      }
    >
      <WorkspaceForm suggestedName="" />
    </AuthCard>
  );
}
