import {
  accountQuota,
  accounts,
  getDb,
  invitations,
  listUserWorkspaces,
  memberships,
  sessions,
  users,
  verifications,
  workspaces,
} from "@sendcoop/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { sendSystemEmail } from "./mailer";

export const auth = betterAuth({
  appName: "Sendcoop",
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { users, sessions, accounts, verifications, workspaces, memberships, invitations },
  }),
  user: { modelName: "users" },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  // Ids come from Postgres (uuidv7() column defaults).
  advanced: { database: { generateId: "uuid" } },
  telemetry: { enabled: false },
  // Better Auth rate-limits auth endpoints in production (sign-in/up: 3 per 10s per IP).
  // Browser tests run many signups from one IP, so CI turns it off for that job only.
  ...(process.env.AUTH_RATE_LIMIT === "disabled" ? { rateLimit: { enabled: false } } : {}),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Not awaited, so response time doesn't reveal whether the email exists.
      void sendSystemEmail({
        to: user.email,
        subject: "Confirm your email for Sendcoop",
        text: `Hi ${user.name},\n\nConfirm your email address to finish signing up:\n${url}\n\nIf you didn't sign up, ignore this email.`,
        html: `<p>Hi ${escapeHtml(user.name)},</p><p>Confirm your email address to finish signing up:</p><p><a href="${url}">Confirm email</a></p><p>If you didn't sign up, ignore this email.</p>`,
      }).catch((error) => console.error("[auth] verification email failed", error));
    },
  },

  databaseHooks: {
    session: {
      create: {
        // New logins start in the user's first workspace (the switcher in D5 changes it).
        before: async (session) => {
          const [first] = await listUserWorkspaces(session.userId);
          return { data: { ...session, activeOrganizationId: first?.id ?? null } };
        },
      },
    },
  },

  plugins: [
    // Better Auth "organizations" are Sendcoop workspaces.
    organization({
      // The plan limits how many workspaces an account owns (D73).
      allowUserToCreateOrganization: async (user) =>
        (await accountQuota(user.id)).room.workspaces > 0,
      schema: {
        organization: { modelName: "workspaces" },
        member: { modelName: "memberships", fields: { organizationId: "workspaceId" } },
        invitation: { modelName: "invitations", fields: { organizationId: "workspaceId" } },
        session: { fields: { activeOrganizationId: "activeWorkspaceId" } },
      },
    }),
    // Lets server actions set auth cookies; must be the last plugin.
    nextCookies(),
  ],
});

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
