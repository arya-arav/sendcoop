import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { ServerEditor } from "../server-editor";

export default async function NewServerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) notFound();

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <Link
        href={`/w/${slug}/settings/servers`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Sending servers
      </Link>
      <ServerEditor
        slug={slug}
        serverId={null}
        initial={{
          name: "",
          type: "ses",
          host: "",
          port: "587",
          secure: false,
          username: "",
          password: "",
          region: "us-east-1",
          accessKeyId: "",
          secretAccessKey: "",
        }}
      />
    </div>
  );
}
