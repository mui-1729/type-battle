import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  webServer: [
    {
      command: "PORT=8787 node apps/cloudflare-worker/scripts/e2e-server.mjs",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: "NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=ws://127.0.0.1:8787 npm run start -w @type-battle/web",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-chromium",
      testMatch: /mobile-.*\.spec\.ts/,
      use: { ...devices["Pixel 5"] }
    }
  ]
});
