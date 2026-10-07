import nodemailer from "nodemailer";

// System mail (verification, password reset, invites). Campaign sending is a
// separate engine in apps/worker (D18+). In development this goes to Mailpit.
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

export async function sendSystemEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  await transport.sendMail({ from: process.env.MAIL_FROM, ...message });
}
