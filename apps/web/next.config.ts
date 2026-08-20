import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentSecurityPolicy } from "./csp";

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(appDir, "../..");
const isDevelopment = process.env.NODE_ENV === "development";
const defaultPreviewRealtimeUrl =
  "wss://type-battle-cloudflare-worker-preview.s1f102503015.workers.dev";
const configuredRealtimeUrl =
  process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL?.trim() ?? "";
const configuredPreviewRealtimeUrl =
  process.env.NEXT_PUBLIC_CLOUDFLARE_PREVIEW_REALTIME_URL?.trim() ?? "";
const realtimeUrl =
  process.env.VERCEL_ENV === "preview"
    ? configuredPreviewRealtimeUrl || defaultPreviewRealtimeUrl
    : configuredRealtimeUrl;

// Next.js currently requires inline bootstrapping/style output for this app.
// Keep those directives scoped as-is and tighten network destinations first.
const contentSecurityPolicy = buildContentSecurityPolicy({
  isDevelopment,
  realtimeUrl
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
  env: {
    NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL: realtimeUrl,
  },
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
