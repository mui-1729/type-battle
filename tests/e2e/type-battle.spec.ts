import { expect, test } from "@playwright/test";

test("creates a room and lets a second player join", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByLabel("Nickname").fill("Alice");
  await host.getByRole("button", { name: "Create room" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await guest.getByLabel("Nickname").fill("Bob");
  await guest.getByLabel("Room code").fill(roomCode);
  await guest.getByTitle("Join room").click();

  await expect(host.getByLabel("Room controls").getByText("Bob")).toBeVisible();
  await expect(guest.getByLabel("Room controls").getByText("Alice")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("plays a complete two player typing match", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByLabel("Nickname").fill("Alice");
  await host.getByRole("button", { name: "Create room" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await guest.getByLabel("Nickname").fill("Bob");
  await guest.getByLabel("Room code").fill(roomCode);
  await guest.getByTitle("Join room").click();

  await host.getByRole("button", { name: "Start" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const promptText = await host.getByLabel("Typing prompt").innerText();

  await Promise.all([
    host.keyboard.type(promptText, { delay: 1 }),
    guest.keyboard.type(promptText, { delay: 1 })
  ]);

  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(guest.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(host.getByText("Rematch")).toBeVisible();
  await expect(guest.getByText("Rematch")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("rejoins the room after reload", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();

  await host.goto("/");
  await host.getByLabel("Nickname").fill("Alice");
  await host.getByRole("button", { name: "Create room" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await host.reload();

  // Wait for reconnection to complete
  await expect(host.locator(".connection")).toHaveClass(/isOnline/);
  await expect(host.locator(".roomMeta strong")).toHaveText(roomCode, { timeout: 10_000 });
  await expect(host.getByLabel("Room controls").getByText("Alice")).toBeVisible();

  await hostContext.close();
});

test("starts a match against COM when alone", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();

  await host.goto("/");
  await host.getByLabel("Nickname").fill("Alice");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host.getByRole("button", { name: "Start vs COM" })).toBeEnabled();
  await host.getByRole("button", { name: "hard" }).click();

  await host.getByRole("button", { name: "Start vs COM" }).click();
  await expect(host.getByLabel("Room controls").getByText("COM (Hard)", { exact: true })).toBeVisible();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const promptText = await host.getByLabel("Typing prompt").innerText();
  await host.keyboard.type(promptText, { delay: 1 });

  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 8_000 });
  await expect(host.locator(".resultPanel").getByText("COM (Hard)", { exact: true })).toBeVisible();

  await hostContext.close();
});

test("forfeits the match after long disconnect", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByLabel("Nickname").fill("Alice");
  await host.getByRole("button", { name: "Create room" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await guest.getByLabel("Nickname").fill("Bob");
  await guest.getByLabel("Room code").fill(roomCode);
  await guest.getByTitle("Join room").click();

  await host.getByRole("button", { name: "Start" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  // Guest disconnects
  await guestContext.close();

  // Should immediately show reconnecting
  await expect(host.locator(".statusTag.isDisconnected")).toBeVisible();
  await expect(host.locator(".rivalBar").getByText("RECONNECTING...")).toBeVisible();

  // Wait for forfeit (grace period + some margin)
  // We've updated playwright.config.ts to set grace period to 5s
  await expect(host.locator(".statusTag.isForfeited")).toBeVisible({ timeout: 25_000 });
  await expect(host.locator(".rivalBar").getByText("FORFEITED")).toBeVisible();

  await hostContext.close();
});

test("completes a practice session", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  await page.getByLabel("Nickname").fill("Alice");
  await expect(page.locator(".connection")).toHaveClass(/isOnline/);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const promptText = await page.getByLabel("Typing prompt").innerText();
  await page.keyboard.type(promptText, { delay: 1 });

  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".resultPanel").getByText("Practice again")).toBeVisible();

  await context.close();
});

test("saves and restores player settings from localStorage", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  
  // Open settings
  await page.getByTitle("Open settings").click();
  await expect(page.getByText("Player Settings")).toBeVisible();

  // Change nickname
  await page.locator(".modalContent input").first().fill("Charlie");
  
  // Toggle dark theme
  await page.getByRole("button", { name: "dark" }).click();
  
  // Change font size
  await page.getByRole("button", { name: "large" }).click();

  // Close modal
  await page.getByRole("button", { name: "Save & Close" }).click();
  await expect(page.getByText("Player Settings")).not.toBeVisible();

  // Verify UI reflects changes
  await expect(page.getByLabel("Nickname")).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);

  // Reload and verify persistence
  await page.reload();
  await expect(page.getByLabel("Nickname")).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);

  await context.close();
});
