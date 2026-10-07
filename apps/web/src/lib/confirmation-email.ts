import { appUrl } from "./app-url";
import { createConfirmToken } from "./confirm-token";
import { sendSystemEmail } from "./mailer";
import { firstTimeWithin } from "./rate-limit";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Sends the double opt-in email, at most once per subscriber per 10 minutes,
 * so a form can't be used to flood someone's inbox. Returns whether it sent.
 * (Moves to the workspace's own sending server once sending is built.)
 */
export async function sendConfirmationEmail(input: {
  to: string;
  subscriberId: string;
  workspaceId: string;
  workspaceName: string;
  formId: string;
}) {
  if (!(await firstTimeWithin(`confirm-email:${input.subscriberId}`, 600))) return false;
  const url = `${appUrl()}/confirm/${createConfirmToken(input)}`;
  const name = input.workspaceName;
  await sendSystemEmail({
    to: input.to,
    subject: `Confirm your subscription to ${name}`,
    text: `Please confirm you'd like to receive emails from ${name}:\n${url}\n\nIf you didn't sign up, ignore this email and you won't hear from us.`,
    html: `<p>Please confirm you'd like to receive emails from <strong>${escapeHtml(name)}</strong>.</p><p><a href="${url}">Confirm my subscription</a></p><p>If you didn't sign up, ignore this email and you won't hear from us.</p>`,
  });
  return true;
}
