import { getPublicForm, listCustomFields, subscribeViaForm } from "@sendcoop/db";
import { appUrl } from "@/lib/app-url";
import { sendConfirmationEmail } from "@/lib/confirmation-email";
import { clientIp, withinRateLimit } from "@/lib/rate-limit";
import { HONEYPOT, parseSignup } from "@/lib/signup-form";

// Public endpoint behind every signup form. Accepts a plain HTML form post
// (works on any website without JavaScript) or JSON. No cookies are used, so
// cross-site posts are expected and safe; abuse is limited by a honeypot, a
// per-IP rate limit and double opt-in.

const SIGNUPS_PER_MINUTE = 10;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const json = request.headers.get("content-type")?.includes("application/json") ?? false;
  const found = await getPublicForm(publicId);
  if (!found) return respond(json, publicId, { status: 404, error: "This form no longer exists." });
  const { form, workspaceName } = found;

  let data: Record<string, unknown>;
  try {
    data = json ? await request.json() : Object.fromEntries((await request.formData()).entries());
  } catch {
    return respond(json, publicId, { status: 400, error: "The form couldn't be read." });
  }

  // Bots fill in every field; people never see this one. Pretend it worked.
  if (typeof data[HONEYPOT] === "string" && data[HONEYPOT].trim() !== "") {
    return respond(json, publicId, { status: 200, form, confirm: form.doubleOptIn });
  }
  if (!(await withinRateLimit(`form:${publicId}:${clientIp(request)}`, SIGNUPS_PER_MINUTE, 60))) {
    return respond(json, publicId, {
      status: 429,
      error: "Too many signups from your network. Try again in a minute.",
    });
  }

  const parsed = parseSignup(form, await listCustomFields(form.workspaceId), data);
  if (!parsed.ok) return respond(json, publicId, { status: 422, error: parsed.error });

  const { outcome, subscriber } = await subscribeViaForm(form, parsed.signup);
  if (outcome === "confirm") {
    await sendConfirmationEmail({
      to: subscriber.email,
      subscriberId: subscriber.id,
      workspaceId: form.workspaceId,
      workspaceName,
      formId: form.id,
    });
  }
  // The same answer whatever the outcome, so the form can't reveal who's subscribed.
  return respond(json, publicId, { status: 200, form, confirm: form.doubleOptIn });
}

function respond(
  json: boolean,
  publicId: string,
  result:
    | { status: number; error: string }
    | {
        status: 200;
        form: { redirectUrl: string | null; successMessage: string };
        confirm: boolean;
      },
) {
  if ("error" in result) {
    if (json)
      return Response.json(
        { ok: false, error: result.error },
        { status: result.status, headers: CORS },
      );
    const back = new URL(`${appUrl()}/f/${publicId}`);
    back.searchParams.set("error", result.error);
    return Response.redirect(back, 303);
  }
  const message = result.confirm
    ? "Almost done: check your inbox and confirm your subscription."
    : result.form.successMessage;
  if (json) return Response.json({ ok: true, message }, { headers: CORS });
  const next = result.form.redirectUrl
    ? new URL(result.form.redirectUrl)
    : new URL(`${appUrl()}/f/${publicId}/thanks${result.confirm ? "?confirm=1" : ""}`);
  return Response.redirect(next, 303);
}
