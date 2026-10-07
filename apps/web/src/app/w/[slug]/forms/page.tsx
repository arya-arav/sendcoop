import { listForms } from "@sendcoop/db";
import { FormInput, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { DeleteFormButton } from "./delete-form";

export default async function FormsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const forms = await listForms(workspace.id);
  const editable = canManage(role);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Signup forms</h1>
          <p className="text-sm text-muted-foreground">
            Collect subscribers on a hosted page or any website.
          </p>
        </div>
        {editable && forms.length > 0 && (
          <Button render={<Link href={`/w/${slug}/forms/new`} />}>
            <Plus />
            New form
          </Button>
        )}
      </div>

      {forms.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <FormInput className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No signup forms yet</p>
            <p className="text-sm text-muted-foreground">
              Create one for a lead magnet, newsletter or webinar registration.
            </p>
          </div>
          {editable && (
            <Button render={<Link href={`/w/${slug}/forms/new`} />}>
              <Plus />
              Create your first form
            </Button>
          )}
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Heading</TableHead>
                <TableHead>Opt-in</TableHead>
                {editable && <TableHead className="w-12 pr-4" aria-label="Actions" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((form) => (
                <TableRow key={form.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/w/${slug}/forms/${form.id}`} className="hover:underline">
                      {form.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{form.title}</TableCell>
                  <TableCell>
                    <Badge variant={form.doubleOptIn ? "secondary" : "outline"}>
                      {form.doubleOptIn ? "Double" : "Single"}
                    </Badge>
                  </TableCell>
                  {editable && (
                    <TableCell className="pr-4 text-right">
                      <DeleteFormButton slug={slug} id={form.id} name={form.name} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
