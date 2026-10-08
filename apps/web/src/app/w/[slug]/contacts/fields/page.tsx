import { listCustomFields, MAX_CUSTOM_FIELDS } from "@sendcoop/db";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { FieldRowActions, NewFieldButton } from "./field-actions";
import { FIELD_TYPE_LABELS } from "./field-types";

export default async function CustomFieldsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const fields = await listCustomFields(workspace.id);
  const editable = canManage(role);
  const atLimit = fields.length >= MAX_CUSTOM_FIELDS;

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/contacts`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Contacts
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold">Custom fields</h1>
          <p className="text-sm text-muted-foreground">
            Extra details stored on each subscriber. Use them in segments and as merge tags.
          </p>
        </div>
        {editable && fields.length > 0 && !atLimit && <NewFieldButton slug={slug} />}
      </div>

      {fields.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <SlidersHorizontal className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No custom fields yet</p>
            <p className="text-sm text-muted-foreground">
              Email, first name and last name are built in. Add fields like company, plan or lead
              score.
            </p>
          </div>
          {editable && <NewFieldButton slug={slug} label="Create your first field" />}
        </Card>
      ) : (
        <>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Label</TableHead>
                  <TableHead>Merge tag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Options</TableHead>
                  {editable && <TableHead className="w-12 pr-4" aria-label="Actions" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell className="pl-4 font-medium">{field.label}</TableCell>
                    <TableCell>
                      <code className="font-mono text-sm">{`{{${field.key}}}`}</code>
                    </TableCell>
                    <TableCell>{FIELD_TYPE_LABELS[field.type]}</TableCell>
                    <TableCell className="whitespace-normal">
                      {field.options.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {field.options.map((o) => (
                            <Badge key={o} variant="outline">
                              {o}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    {editable && (
                      <TableCell className="pr-4 text-right">
                        <FieldRowActions
                          slug={slug}
                          field={{
                            id: field.id,
                            label: field.label,
                            key: field.key,
                            type: field.type,
                            options: field.options,
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {atLimit && (
            <p className="text-sm text-muted-foreground">
              You&apos;ve reached the limit of {MAX_CUSTOM_FIELDS} custom fields.
            </p>
          )}
        </>
      )}
    </div>
  );
}
