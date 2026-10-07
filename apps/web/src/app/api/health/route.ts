import { pingDatabase, type ServiceName } from "@sendcoop/db";
import { pingRedis } from "@sendcoop/redis";

export const dynamic = "force-dynamic";

const service: ServiceName = "web";

export async function GET() {
  const [postgres, redis] = await Promise.all([pingDatabase(), pingRedis()]);
  const ok = postgres && redis;
  return Response.json({ service, ok, postgres, redis }, { status: ok ? 200 : 503 });
}
