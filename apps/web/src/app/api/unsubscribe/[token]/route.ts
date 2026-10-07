import { readUnsubscribeToken, unsubscribeByMessage } from "@sendcoop/db";
import { appUrl } from "@/lib/app-url";

// The RFC 8058 one-click endpoint named in every campaign's List-Unsubscribe
// header. Gmail, Yahoo and others POST here (body "List-Unsubscribe=One-Click")
// when someone clicks their Unsubscribe button; the signed token is the only
// credential, so there are no cookies and cross-site posts are expected.

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const messageId = readUnsubscribeToken(token);
  if (!messageId || !(await unsubscribeByMessage(messageId))) {
    return new Response("This unsubscribe link isn't valid.", { status: 404 });
  }
  return new Response("You're unsubscribed.", { status: 200 });
}

/** Older mail apps open the header link in a browser: show the page instead. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return Response.redirect(`${appUrl()}/u/${encodeURIComponent(token)}`, 303);
}
