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

  await host.getByRole("button", { name: "Start vs COM" }).click();
  await expect(host.getByLabel("Room controls").getByText("COM")).toBeVisible();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const promptText = await host.getByLabel("Typing prompt").innerText();
  await host.keyboard.type(promptText, { delay: 1 });

  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 8_000 });
  await expect(host.locator(".resultPanel").getByText("COM")).toBeVisible();

  await hostContext.close();
});
