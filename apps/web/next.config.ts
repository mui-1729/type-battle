import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(appDir, "../..");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.16.240.247"],
  outputFileTracingRoot: repoRoot
};

export default nextConfig;
