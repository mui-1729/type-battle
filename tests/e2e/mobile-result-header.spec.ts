import { expect, test, type Page } from "@playwright/test";
import { readInputGuide, selectPracticeMode, setNickname, typeInputGuide } from "./helpers";

async function completePractice(page: Page): Promise<void> {
  await page.goto("/");
  await setNickname(page, "ResultHeader");
  await selectPracticeMode(page);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await typeInputGuide(page, await readInputGuide(page));
  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 }
]) {
  test(`keeps result header controls inside ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await completePractice(page);

    const geometry = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll<HTMLElement>(
        ".topBar .headerBackButton, .topBar .statusPill, .topBar .headerActions button"
      )).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top
        };
      });
      return {
        controls,
        documentWidth: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      };
    });
    expect(geometry.controls).toHaveLength(3);
    for (const control of geometry.controls) {
      expect(control.left).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(control.top).toBeGreaterThanOrEqual(0);
      expect(control.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    }
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);

    const exitButton = page.locator(".headerBackButton");
    await expect(exitButton).toBeVisible();
    if (viewport.width === 320) {
      await exitButton.click();
    } else {
      await exitButton.focus();
      await expect(exitButton).toBeFocused();
      await exitButton.press("Enter");
    }
    await expect(page.locator(".soloModePicker")).toBeVisible();
  });
}
