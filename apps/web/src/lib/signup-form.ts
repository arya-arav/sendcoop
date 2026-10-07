import type { CustomField, FormSignup, SignupForm } from "@sendcoop/db";
import { parseFieldValues } from "@sendcoop/db/custom-fields";
import { z } from "zod";

// What a signup form shows and accepts. Used by the hosted page, the public
// subscribe endpoint and the embed code, so all three agree on field names.

export const HONEYPOT = "website";

export type FormInput =
  | { name: "firstName" | "lastName"; label: string; kind: "name" }
  | { name: string; label: string; kind: "custom"; field: CustomField };

/** The inputs a form shows besides email, in the form's order. */
export function formInputs(form: SignupForm, customFields: CustomField[]): FormInput[] {
  return form.fields.flatMap((key): FormInput[] => {
    if (key === "first_name") return [{ name: "firstName", label: "First name", kind: "name" }];
    if (key === "last_name") return [{ name: "lastName", label: "Last name", kind: "name" }];
    const field = customFields.find((f) => f.key === key);
    return field ? [{ name: `cf_${field.key}`, label: field.label, kind: "custom", field }] : [];
  });
}

const email = z.string().trim().pipe(z.email());
const name = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : null;

/** Validates a submission. Only the form's own fields are read; anything else is ignored. */
export function parseSignup(
  form: SignupForm,
  customFields: CustomField[],
  data: Record<string, unknown>,
): { ok: true; signup: FormSignup } | { ok: false; error: string } {
  const parsedEmail = email.safeParse(data.email ?? "");
  if (!parsedEmail.success) return { ok: false, error: "Enter a valid email address." };

  const inputs = formInputs(form, customFields);
  const custom = inputs.filter((i) => i.kind === "custom");
  const values = parseFieldValues(
    custom.map((i) => i.field),
    Object.fromEntries(custom.map((i) => [i.field.key, data[i.name]])),
  );
  if (!values.ok) return { ok: false, error: Object.values(values.errors)[0]! };

  const shows = new Set(inputs.map((i) => i.name));
  return {
    ok: true,
    signup: {
      email: parsedEmail.data,
      firstName: shows.has("firstName") ? name(data.firstName) : null,
      lastName: shows.has("lastName") ? name(data.lastName) : null,
      fields: values.values,
    },
  };
}

function attr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Plain HTML for any website: works without JavaScript, posts to our endpoint. */
export function embedHtml(form: SignupForm, inputs: FormInput[], baseUrl: string) {
  const line = (label: string, input: string) =>
    `  <p><label>${attr(label)}<br>${input}</label></p>`;
  const fields = inputs.map((i) => {
    if (i.kind === "custom" && i.field.type === "dropdown") {
      const options = i.field.options.map((o) => `<option>${attr(o)}</option>`).join("");
      return line(
        i.label,
        `<select name="${i.name}"><option value=""></option>${options}</select>`,
      );
    }
    const type =
      i.kind === "custom"
        ? { number: "number", date: "date", text: "text", dropdown: "text" }[i.field.type]
        : "text";
    return line(i.label, `<input type="${type}" name="${i.name}">`);
  });
  return [
    `<form action="${baseUrl}/api/forms/${form.publicId}/subscribe" method="post">`,
    line("Email", `<input type="email" name="email" required>`),
    ...fields,
    `  <!-- Leave this empty: it catches spam bots. -->`,
    `  <input type="text" name="${HONEYPOT}" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">`,
    `  <p><button type="submit">${attr(form.buttonText)}</button></p>`,
    `</form>`,
  ].join("\n");
}
