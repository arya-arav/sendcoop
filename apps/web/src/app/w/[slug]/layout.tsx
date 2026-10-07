import { requireMemberWorkspace } from "@/lib/workspace";

// Every page under /w/<slug> requires membership in that workspace.
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await requireMemberWorkspace((await params).slug);
  return children;
}
