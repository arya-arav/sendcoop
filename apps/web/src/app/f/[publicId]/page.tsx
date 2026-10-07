import { getPublicForm, listCustomFields } from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PublicShell } from "@/components/public-shell";
import { formInputs, HONEYPOT } from "@/lib/signup-form";

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getPublicForm((await params).publicId);
  return { title: found ? `${found.form.title} · ${found.workspaceName}` : "Sendcoop" };
}

/** Hosted signup page. A plain HTML form: it works without JavaScript. */
export default async function HostedFormPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const { error } = await searchParams;
  const found = await getPublicForm(publicId);
  if (!found) notFound();
  const { form, workspaceName } = found;
  const inputs = formInputs(form, await listCustomFields(form.workspaceId));

  return (
    <PublicShell>
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">{workspaceName}</p>
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">{form.title}</h1>
          </CardTitle>
          {form.description && <CardDescription>{form.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form action={`/api/forms/${publicId}/subscribe`} method="post" className="grid gap-4">
            <FormError message={error ? error.slice(0, 200) : null} />
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {inputs.map((input) => (
              <div key={input.name} className="grid gap-2">
                <Label htmlFor={input.name}>{input.label}</Label>
                {input.kind === "custom" && input.field.type === "dropdown" ? (
                  <NativeSelect
                    id={input.name}
                    name={input.name}
                    defaultValue=""
                    className="w-full"
                  >
                    <NativeSelectOption value="">—</NativeSelectOption>
                    {input.field.options.map((o) => (
                      <NativeSelectOption key={o} value={o}>
                        {o}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id={input.name}
                    name={input.name}
                    type={
                      input.kind === "custom" && input.field.type === "number"
                        ? "number"
                        : input.kind === "custom" && input.field.type === "date"
                          ? "date"
                          : "text"
                    }
                    autoComplete={
                      input.name === "firstName"
                        ? "given-name"
                        : input.name === "lastName"
                          ? "family-name"
                          : "off"
                    }
                  />
                )}
              </div>
            ))}
            {/* Catches bots: hidden from people and screen readers. */}
            <input
              type="text"
              name={HONEYPOT}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] size-px opacity-0"
            />
            <Button type="submit" className="w-full">
              {form.buttonText}
            </Button>
            <p className="text-xs text-muted-foreground">
              You can unsubscribe at any time from any email you receive.
            </p>
          </form>
        </CardContent>
      </Card>
    </PublicShell>
  );
}
