import { defineConfig, devices } from "@playwright/test";

const REALTIME_TRANSPORT = process.env.PLAYWRIGHT_REALTIME_TRANSPORT === "cloudflare" ? "cloudflare" : "socketio";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  webServer:
    REALTIME_TRANSPORT === "cloudflare"
      ? [
          {
            command: "node --import tsx tests/e2e/support/cloudflare-worker-dev.ts",
            url: "http://127.0.0.1:3001/health",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000
          },
          {
            command:
              "NEXT_PUBLIC_REALTIME_TRANSPORT=cloudflare NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=ws://127.0.0.1:3001 npm run start -w @type-battle/web",
            url: "http://127.0.0.1:3000",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000
          }
        ]
      : [
          {
            command: "NODE_ENV=test npm run start -w @type-battle/realtime",
            url: "http://127.0.0.1:3001/health",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000
          },
          {
            command:
              "NEXT_PUBLIC_REALTIME_TRANSPORT=socketio NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:3001 npm run start -w @type-battle/web",
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
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
