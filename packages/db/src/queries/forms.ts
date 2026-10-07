import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import type { FieldValue } from "../custom-fields";
import {
  listMemberships,
  lists,
  type SignupForm,
  signupForms,
  type Subscriber,
  subscribers,
  workspaces,
} from "../schema";
import { normalizeEmail } from "./subscribers";

// Management queries are scoped by workspaceId; the public ones go through the
// form's random publicId and only ever touch that form's workspace.

export type SignupFormInput = Pick<
  SignupForm,
  | "name"
  | "title"
  | "description"
  | "buttonText"
  | "successMessage"
  | "redirectUrl"
  | "fields"
  | "listIds"
  | "doubleOptIn"
>;

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 12 unambiguous characters (~70 bits): unguessable, short enough for links. */
function newPublicId() {
  return [...randomBytes(12)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function listForms(workspaceId: string): Promise<SignupForm[]> {
  return getDb()
    .select()
    .from(signupForms)
    .where(eq(signupForms.workspaceId, workspaceId))
    .orderBy(asc(signupForms.createdAt));
}

export async function getForm(workspaceId: string, formId: string): Promise<SignupForm | null> {
  const [form] = await getDb()
    .select()
    .from(signupForms)
    .where(and(eq(signupForms.id, formId), eq(signupForms.workspaceId, workspaceId)));
  return form ?? null;
}

export async function createForm(workspaceId: string, input: SignupFormInput) {
  const [form] = await getDb()
    .insert(signupForms)
    .values({ workspaceId, publicId: newPublicId(), ...input })
    .returning();
  return form!;
}

export async function updateForm(workspaceId: string, formId: string, input: SignupFormInput) {
  const [form] = await getDb()
    .update(signupForms)
    .set(input)
    .where(and(eq(signupForms.id, formId), eq(signupForms.workspaceId, workspaceId)))
    .returning();
  return form ?? null;
}

export async function deleteForm(workspaceId: string, formId: string) {
  const deleted = await getDb()
    .delete(signupForms)
    .where(and(eq(signupForms.id, formId), eq(signupForms.workspaceId, workspaceId)))
    .returning({ id: signupForms.id });
  return deleted.length > 0;
}

/** The form behind a public link, with its workspace's name. */
export async function getPublicForm(publicId: string) {
  const [row] = await getDb()
    .select({ form: signupForms, workspaceName: workspaces.name })
    .from(signupForms)
    .innerJoin(workspaces, eq(workspaces.id, signupForms.workspaceId))
    .where(eq(signupForms.publicId, publicId));
  return row ?? null;
}

export type FormSignup = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  fields: Record<string, FieldValue>;
};

/**
 * What happened, which decides the email to send:
 * - "subscribed": new and subscribed straight away (single opt-in)
 * - "confirm": send a confirmation email (new with double opt-in, still
 *   pending, or previously unsubscribed: they must confirm to come back)
 * - "already": already subscribed; nothing to send
 * - "blocked": bounced or complained; never email them
 * The person filling in the form sees the same response in every case.
 */
export type FormSignupOutcome = "subscribed" | "confirm" | "already" | "blocked";

export async function subscribeViaForm(
  form: SignupForm,
  input: FormSignup,
): Promise<{ outcome: FormSignupOutcome; subscriber: Subscriber }> {
  const email = normalizeEmail(input.email);
  return getDb().transaction(async (tx) => {
    const status = form.doubleOptIn ? "pending" : "subscribed";
    const [created] = await tx
      .insert(subscribers)
      .values({
        workspaceId: form.workspaceId,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        fields: input.fields,
        status,
        source: "form",
        subscribedAt: status === "subscribed" ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning();

    let subscriber: Subscriber;
    let outcome: FormSignupOutcome;
    if (created) {
      subscriber = created;
      outcome = form.doubleOptIn ? "confirm" : "subscribed";
    } else {
      // Anyone can type any address into a public form, so details only fill
      // gaps; they never overwrite what's already there.
      const [existing] = await tx
        .update(subscribers)
        .set({
          firstName: sql`coalesce(${subscribers.firstName}, ${input.firstName})`,
          lastName: sql`coalesce(${subscribers.lastName}, ${input.lastName})`,
          fields: sql`${JSON.stringify(input.fields)}::jsonb || ${subscribers.fields}`,
        })
        .where(and(eq(subscribers.workspaceId, form.workspaceId), eq(subscribers.email, email)))
        .returning();
      subscriber = existing!;
      outcome =
        subscriber.status === "subscribed"
          ? "already"
          : subscriber.status === "pending" || subscriber.status === "unsubscribed"
            ? "confirm"
            : "blocked";
    }

    // Only lists that still exist in this workspace.
    if (form.listIds.length > 0 && outcome !== "blocked") {
      const valid = await tx
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.workspaceId, form.workspaceId), inArray(lists.id, form.listIds)));
      if (valid.length > 0) {
        await tx
          .insert(listMemberships)
          .values(valid.map((l) => ({ listId: l.id, subscriberId: subscriber.id })))
          .onConflictDoNothing();
      }
    }
    return { outcome, subscriber };
  });
}

/**
 * Marks a subscriber confirmed after they clicked the link in the
 * confirmation email. Pending and unsubscribed people become subscribed;
 * bounced and complained ones never do. Returns the resulting status.
 */
export async function confirmSubscriber(workspaceId: string, subscriberId: string) {
  const db = getDb();
  await db
    .update(subscribers)
    .set({ status: "subscribed", subscribedAt: new Date(), unsubscribedAt: null })
    .where(
      and(
        eq(subscribers.id, subscriberId),
        eq(subscribers.workspaceId, workspaceId),
        inArray(subscribers.status, ["pending", "unsubscribed"]),
      ),
    );
  const [row] = await db
    .select({ status: subscribers.status })
    .from(subscribers)
    .where(and(eq(subscribers.id, subscriberId), eq(subscribers.workspaceId, workspaceId)));
  return row?.status ?? null;
}
