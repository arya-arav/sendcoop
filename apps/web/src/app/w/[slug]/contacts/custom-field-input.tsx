import type { CustomFieldType } from "@sendcoop/db/custom-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type FieldDefinitionView = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
};

/** One custom field in a form, submitted as cf_<key>. */
export function CustomFieldInput({ field, error }: { field: FieldDefinitionView; error?: string }) {
  const id = `cf-${field.key}`;
  const name = `cf_${field.key}`;
  const errorId = error ? `${id}-error` : undefined;
  const shared = { id, name, "aria-invalid": Boolean(error), "aria-describedby": errorId };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "dropdown" ? (
        <NativeSelect {...shared} defaultValue="" className="w-full">
          <NativeSelectOption value="">—</NativeSelectOption>
          {field.options.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : field.type === "number" ? (
        <Input {...shared} type="number" step="any" inputMode="decimal" />
      ) : field.type === "date" ? (
        <Input {...shared} type="date" />
      ) : (
        <Input {...shared} maxLength={500} />
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
