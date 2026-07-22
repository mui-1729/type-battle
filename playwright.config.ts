import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const webUrl = `http://127.0.0.1:${webPort}`;
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const chromiumLaunchOptions = chromiumExecutablePath
  ? { launchOptions: { executablePath: chromiumExecutablePath } }
  : {};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  webServer: [
    {
      command: "node apps/cloudflare-worker/scripts/e2e-server.mjs",
      env: {
        PORT: "8787"
      },
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: `npm exec next start -w @type-battle/web -- --hostname 127.0.0.1 --port ${webPort}`,
      env: {
        NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL: process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL ?? "ws://127.0.0.1:8787"
      },
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ],
  use: {
    baseURL: webUrl,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...chromiumLaunchOptions }
    },
    {
      name: "mobile-chromium",
      testMatch: /mobile-.*\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        ...chromiumLaunchOptions,
        viewport: { width: 390, height: 844 }
      }
    }
  ]
});
