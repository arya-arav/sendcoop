import { SignOutButton } from "@/components/sign-out-button";
import { requireMemberWorkspace } from "@/lib/workspace";

export default async function WorkspaceHome({ params }: { params: Promise<{ slug: string }> }) {
  const { user, workspace, role } = await requireMemberWorkspace((await params).slug);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">Workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
        </div>
        <SignOutButton />
      </div>
      <p className="mt-6 text-zinc-600 dark:text-zinc-400">
        Signed in as {user.email} ({role}). The dashboard arrives with the app shell in D5.
      </p>
    </main>
  );
}
