import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentSecurityPolicy } from "./csp";

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(appDir, "../..");
const isDevelopment = process.env.NODE_ENV === "development";

// Next.js currently requires inline bootstrapping/style output for this app.
// Keep those directives scoped as-is and tighten network destinations first.
const contentSecurityPolicy = buildContentSecurityPolicy({
  isDevelopment,
  realtimeUrl: process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL
});

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  allowedDevOrigins: ["*.*.*.*"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
