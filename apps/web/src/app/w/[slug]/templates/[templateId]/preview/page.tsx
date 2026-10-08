import { getTemplate } from "@sendcoop/db";
import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkEmail } from "@/lib/email-checks";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Preview template" };

// The saved email as recipients get it, at desktop and phone widths, in
// sandboxed frames (no scripts, no access to the app).
export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ slug: string; templateId: string }>;
}) {
  const { slug, templateId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!z.uuid().safeParse(templateId).success) notFound();
  const template = await getTemplate(workspace.id, templateId);
  if (!template) notFound();
  const checks = checkEmail(template.html);
  const back = canManage(role)
    ? { href: `/w/${slug}/templates/${template.id}`, label: "Back to editor" }
    : { href: `/w/${slug}/templates`, label: "Templates" };

  return (
    <div className="grid gap-6">
      <Link
        href={back.href}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {back.label}
      </Link>
      <div>
        <h1 className="text-[22px] font-semibold">{template.name}</h1>
        <p className="text-sm text-muted-foreground">
          The last saved version. Merge tags like {"{{first_name}}"} are filled in for each
          recipient when sent.
        </p>
      </div>

      {/* Plain-text templates have no HTML: nothing to check or render. */}
      {template.html && (
        <>
          <section aria-label="Checks" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {checks.map((check) => (
              <Card key={check.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {check.ok ? (
                      <CircleCheck className="size-4 text-green-600" aria-label="OK" />
                    ) : (
                      <CircleAlert
                        className="size-4 text-destructive"
                        aria-label="Needs attention"
                      />
                    )}
                    <h2>{check.label}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{check.detail}</CardContent>
              </Card>
            ))}
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
            <figure className="grid gap-2">
              <figcaption className="text-sm font-medium">Desktop</figcaption>
              <iframe
                title="Desktop preview"
                sandbox=""
                srcDoc={template.html}
                className="h-[720px] w-full rounded-lg border bg-white"
              />
            </figure>
            <figure className="grid gap-2">
              <figcaption className="text-sm font-medium">Phone</figcaption>
              <iframe
                title="Phone preview"
                sandbox=""
                srcDoc={template.html}
                className="h-[720px] w-[375px] max-w-full rounded-[2rem] border-8 border-zinc-800 bg-white"
              />
            </figure>
          </div>
        </>
      )}

      <figure className="grid gap-2">
        <figcaption className="text-sm font-medium">
          {template.html ? "Plain-text version" : "The email (sent as plain text)"}
        </figcaption>
        <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
          {template.text || "(empty)"}
        </pre>
      </figure>
    </div>
  );
}
