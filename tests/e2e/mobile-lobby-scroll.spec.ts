import { expect, test } from "@playwright/test";
import { dismissTutorial, selectBattleMode, setNickname } from "./helpers";

test("keeps every lobby control reachable on a short mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await dismissTutorial(page);
  await setNickname(page, "MobileLobby");
  await selectBattleMode(page);
  await page.getByRole("button", { name: "ルームを作成" }).click();

  const shell = page.locator(".appShell.isLobby");
  const roomCode = page.locator(".lobbyRoomCode");
  const equipment = page.locator(".quickEquipmentPicker");
  const settings = page.locator(".lobbySettingsCard");
  const ready = page.locator(".lobbyReadyButton");

  await expect(shell).toHaveCSS("overflow-y", "auto");
  await expect(roomCode).toBeVisible();
  await expect(equipment).toBeVisible();

  const initialMetrics = await shell.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  }));
  await ready.scrollIntoViewIfNeeded();
  const finalGeometry = await shell.evaluate((element) => {
    const settingsElement = document.querySelector<HTMLElement>(".lobbySettingsCard");
    const readyElement = document.querySelector<HTMLElement>(".lobbyReadyButton");
    if (!settingsElement || !readyElement) {
      throw new Error("Expected lobby settings and READY controls.");
    }
    const settingsRect = settingsElement.getBoundingClientRect();
    const readyRect = readyElement.getBoundingClientRect();
    return {
      documentFitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
      readyBottom: readyRect.bottom,
      readyTop: readyRect.top,
      scrollTop: element.scrollTop,
      settingsBottom: settingsRect.bottom,
      settingsTop: settingsRect.top,
      viewportHeight: window.innerHeight
    };
  });

  expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);
  expect(finalGeometry.scrollTop).toBeGreaterThan(initialMetrics.scrollTop);
  expect(finalGeometry.settingsTop).toBeGreaterThanOrEqual(0);
  expect(finalGeometry.settingsBottom).toBeLessThanOrEqual(finalGeometry.viewportHeight);
  expect(finalGeometry.readyTop).toBeGreaterThanOrEqual(0);
  expect(finalGeometry.readyBottom).toBeLessThanOrEqual(finalGeometry.viewportHeight);
  expect(finalGeometry.documentFitsViewport).toBe(true);
  await expect(settings).toBeVisible();
  await expect(ready).toBeVisible();
  await ready.tap();
});
