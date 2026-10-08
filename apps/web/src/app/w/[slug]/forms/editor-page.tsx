import { listCustomFields, listLists, type SignupForm } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { canManage } from "@/lib/permissions";
import { embedHtml, formInputs } from "@/lib/signup-form";
import { requireMemberWorkspace } from "@/lib/workspace";
import { FormEditor } from "./form-editor";

/** Shared by /forms/new and /forms/[formId]. */
export async function FormEditorPage({
  slug,
  load,
}: {
  slug: string;
  load?: (workspaceId: string) => Promise<SignupForm | null>;
}) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) notFound();
  const form = load ? await load(workspace.id) : null;
  if (load && !form) notFound();
  const [customFields, lists] = await Promise.all([
    listCustomFields(workspace.id),
    listLists(workspace.id),
  ]);

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/forms`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Signup forms
      </Link>
      <h1 className="text-[22px] font-semibold">{form ? form.name : "New form"}</h1>
      <FormEditor
        slug={slug}
        formId={form?.id ?? null}
        initial={
          form
            ? {
                name: form.name,
                title: form.title,
                description: form.description ?? "",
                buttonText: form.buttonText,
                successMessage: form.successMessage,
                redirectUrl: form.redirectUrl ?? "",
                fields: form.fields,
                listIds: form.listIds,
                doubleOptIn: form.doubleOptIn,
              }
            : {
                name: "Newsletter signup",
                title: `Join ${workspace.name}`,
                description: "",
                buttonText: "Subscribe",
                successMessage: "Thanks for subscribing!",
                redirectUrl: "",
                fields: ["first_name"],
                listIds: [],
                doubleOptIn: true,
              }
        }
        fieldOptions={[
          { key: "first_name", label: "First name" },
          { key: "last_name", label: "Last name" },
          ...customFields.map((f) => ({ key: f.key, label: f.label })),
        ]}
        lists={lists.map(({ id, name }) => ({ id, name }))}
        share={
          form
            ? {
                hostedUrl: `${appUrl()}/f/${form.publicId}`,
                embedHtml: embedHtml(form, formInputs(form, customFields), appUrl()),
              }
            : null
        }
      />
    </div>
  );
}
