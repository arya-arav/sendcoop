import type { CustomFieldType } from "@sendcoop/db/custom-fields";

export type FieldType = CustomFieldType;

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
};
