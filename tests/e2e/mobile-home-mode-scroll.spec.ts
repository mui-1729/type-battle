import { expect, test } from "@playwright/test";
import { dismissTutorial } from "./helpers";

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 640 }
]) {
  test(`keeps both home modes reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await dismissTutorial(page);

    const menu = page.locator(".homeModeMenu");
    const battleButton = page.locator(".modeCardBattle .modeCardButton");
    const soloButton = page.locator(".modeCardSolo .modeCardButton");

    await expect(menu).toHaveCSS("overflow-y", "auto");
    const initialGeometry = await page.evaluate(() => {
      const menuElement = document.querySelector<HTMLElement>(".homeModeMenu");
      const battleElement = document.querySelector<HTMLElement>(".modeCardBattle .modeCardButton");
      const soloElement = document.querySelector<HTMLElement>(".modeCardSolo .modeCardButton");
      if (!menuElement || !battleElement || !soloElement) {
        throw new Error("Expected home mode controls to be rendered.");
      }
      const battleRect = battleElement.getBoundingClientRect();
      const soloRect = soloElement.getBoundingClientRect();
      return {
        battle: { top: battleRect.top, bottom: battleRect.bottom },
        menuScrollTop: menuElement.scrollTop,
        solo: { top: soloRect.top, bottom: soloRect.bottom },
        viewportHeight: window.innerHeight
      };
    });
    expect(initialGeometry.battle.top).toBeGreaterThanOrEqual(0);
    expect(initialGeometry.battle.bottom).toBeLessThanOrEqual(initialGeometry.viewportHeight);
    await expect(battleButton).toBeEnabled();
    const soloWasClipped = initialGeometry.solo.top < 0 ||
      initialGeometry.solo.bottom > initialGeometry.viewportHeight;

    await soloButton.scrollIntoViewIfNeeded();
    const geometry = await soloButton.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const menuElement = document.querySelector<HTMLElement>(".homeModeMenu");
      return {
        bottom: rect.bottom,
        top: rect.top,
        menuScrollTop: menuElement?.scrollTop ?? 0,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    if (soloWasClipped) {
      expect(geometry.menuScrollTop).toBeGreaterThan(initialGeometry.menuScrollTop);
    }

    if (viewport.width === 320) {
      await soloButton.click();
    } else {
      await soloButton.focus();
      await expect(soloButton).toBeFocused();
      await soloButton.press("Enter");
    }
    await expect(page.locator(".soloModePicker")).toBeVisible();
  });
}
