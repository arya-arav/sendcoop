import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// One .env at the repo root is shared by every app; Next.js only looks in apps/web.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@sendcoop/db",
    "@sendcoop/mailer",
    "@sendcoop/queue",
    "@sendcoop/redis",
    "@sendcoop/storage",
  ],
  // BullMQ loads its Lua scripts from files at runtime, so it can't be bundled.
  serverExternalPackages: [
    "bullmq",
    "@aws-sdk/client-sesv2",
    "@aws-sdk/client-s3",
    "mjml",
    "sharp",
  ],
};

export default nextConfig;
