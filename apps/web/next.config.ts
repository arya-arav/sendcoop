import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// One .env at the repo root is shared by every app; Next.js only looks in apps/web.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Security headers (D79). Pages can't be framed, except signup forms (/f/…),
// which customers embed on their own sites.
const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/((?!f/).*)",
        headers: [
          ...common,
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      { source: "/f/:path*", headers: common },
    ];
  },
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@sendcoop/db",
    "@sendcoop/mailer",
    "@sendcoop/queue",
    "@sendcoop/redis",
    "@sendcoop/storage",
    "@sendcoop/utmcap",
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
