import type { ServiceName } from "@sendcoop/db";

const service: ServiceName = "web";

export function GET() {
  return Response.json({ service, ok: true });
}
