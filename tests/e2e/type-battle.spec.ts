import { expect, test } from "@playwright/test";

test("creates a room and lets a second player join", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await guest.getByLabel("ニックネーム").fill("Bob");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();

  await expect(host.getByLabel("ルーム操作").getByText("Bob")).toBeVisible();
  await expect(guest.getByLabel("ルーム操作").getByText("Alice")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("plays a complete two player typing match", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await guest.getByLabel("ニックネーム").fill("Bob");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();

  await host.getByRole("button", { name: "開始" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const promptText = await host.getByLabel("課題文").innerText();

  await Promise.all([
    host.keyboard.type(promptText, { delay: 1 }),
    guest.keyboard.type(promptText, { delay: 1 })
  ]);

  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(guest.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(host.getByText("再戦する")).toBeVisible();
  await expect(guest.getByText("再戦する")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("rejoins the room after reload", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();

  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await host.reload();

  // Wait for reconnection to complete
  await expect(host.locator(".connection")).toHaveClass(/isOnline/);
  await expect(host.locator(".roomMeta strong")).toHaveText(roomCode, { timeout: 10_000 });
  await expect(host.getByLabel("ルーム操作").getByText("Alice")).toBeVisible();

  await hostContext.close();
});

test("starts a match against COM when alone", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();

  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();
  await expect(host.getByRole("button", { name: "COM と開始" })).toBeEnabled();
  await host.getByRole("button", { name: "むずかしい" }).click();

  await host.getByRole("button", { name: "COM と開始" }).click();
  await expect(host.getByLabel("ルーム操作").getByText("COM (Hard)", { exact: true })).toBeVisible();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const promptText = await host.getByLabel("課題文").innerText();
  await host.keyboard.type(promptText, { delay: 1 });

  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 8_000 });
  await expect(host.locator(".resultPanel").getByText("COM (Hard)", { exact: true })).toBeVisible();

  await hostContext.close();
});

test("forfeits the match after long disconnect", async ({ browser }) => {
  test.setTimeout(60_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByLabel("ニックネーム").fill("Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await guest.getByLabel("ニックネーム").fill("Bob");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();

  await host.getByRole("button", { name: "開始" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  // Guest disconnects
  await guestContext.close();

  // Should immediately show reconnecting
  await expect(host.locator(".statusTag.isDisconnected")).toBeVisible();
  await expect(host.locator(".rivalBar").getByText("再接続中...")).toBeVisible();

  // Wait for forfeit. Local runs can reuse an existing realtime server with the default 30s grace period.
  await expect(host.locator(".statusTag.isForfeited")).toBeVisible({ timeout: 40_000 });
  await expect(host.locator(".rivalBar").getByText("棄権")).toBeVisible();

  await hostContext.close();
});

test("completes a practice session", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  await page.getByLabel("ニックネーム").fill("Alice");
  await expect(page.locator(".connection")).toHaveClass(/isOnline/);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const promptText = await page.getByLabel("課題文").innerText();
  await page.keyboard.type(promptText, { delay: 1 });

  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".resultPanel").getByText("もう一度練習")).toBeVisible();

  await context.close();
});

test("saves and restores player settings from localStorage", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  
  // Open settings
  await page.getByTitle("設定を開く").click();
  await expect(page.getByText("プレイヤー設定")).toBeVisible();

  // Change nickname
  await page.locator(".modalContent input").first().fill("Charlie");
  
  // Toggle dark theme
  await page.getByRole("button", { name: "ダーク" }).click();
  
  // Change font size
  await page.getByRole("button", { name: "大" }).click();

  // Close modal
  await page.getByRole("button", { name: "保存して閉じる" }).click();
  await expect(page.getByText("プレイヤー設定")).not.toBeVisible();

  // Verify UI reflects changes
  await expect(page.getByLabel("ニックネーム")).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);

  // Reload and verify persistence
  await page.reload();
  await expect(page.getByLabel("ニックネーム")).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);

  await context.close();
});
