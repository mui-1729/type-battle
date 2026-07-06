import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  webServer: [
    {
      command: "NODE_ENV=test npm run start -w @type-battle/realtime",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: "NEXT_PUBLIC_REALTIME_TRANSPORT=socketio NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:3001 npm run start -w @type-battle/web",
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
