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
    const soloButton = page.locator(".modeCardSolo .modeCardButton");

    await expect(menu).toHaveCSS("overflow-y", "auto");
    expect(await soloButton.evaluate((button) => button.getBoundingClientRect().bottom)).toBeGreaterThan(viewport.height);

    await soloButton.scrollIntoViewIfNeeded();
    const geometry = await soloButton.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        top: rect.top,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);

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
