import { listUserWorkspaces } from "@sendcoop/db";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

// Entry point: send people to their active workspace, or to onboarding if they have none.
export default async function Home() {
  const { session, user } = await requireSession();
  const userWorkspaces = await listUserWorkspaces(user.id);
  if (userWorkspaces.length === 0) redirect("/onboarding");

  const active = userWorkspaces.find((w) => w.id === session.activeOrganizationId);
  redirect(`/w/${(active ?? userWorkspaces[0]!).slug}`);
}
