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
