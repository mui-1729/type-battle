import { expect, test } from "@playwright/test";
import { selectBattleMode, setNickname } from "./helpers";

test("serves the application with defensive security headers", async ({ request }) => {
  const response = await request.get("/");

  expect(response.ok()).toBe(true);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  );

  const contentSecurityPolicy = response.headers()["content-security-policy"];
  expect(contentSecurityPolicy).toContain("default-src 'self'");
  expect(contentSecurityPolicy).toContain("connect-src 'self' ws://127.0.0.1:8787");
  expect(contentSecurityPolicy).not.toContain("connect-src 'self' https: wss: ws:");
  expect(contentSecurityPolicy).toContain("object-src 'none'");
  expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
});

test("keeps the realtime room flow usable under the content security policy", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  await selectBattleMode(page);
  await setNickname(page, "SecurityHeaderTest");
  await page.getByRole("button", { name: "ルームを作成" }).click();

  await expect(page.getByTestId("lobby-prep")).toBeVisible();
  expect(consoleErrors.filter((message) => message.includes("Content Security Policy"))).toEqual([]);
});
