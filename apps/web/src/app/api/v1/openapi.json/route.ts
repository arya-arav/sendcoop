import { appUrl } from "@/lib/app-url";
import { openApiDocument } from "@/lib/openapi";

/** The REST API's description, for API clients and code generators (D77). */
export function GET() {
  return Response.json(openApiDocument(appUrl()), {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
  });
}
