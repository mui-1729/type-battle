import { expect, test } from "@playwright/test";
import { selectPracticeMode, setNickname } from "./helpers";

for (const width of [320, 390, 393]) {
  test(`keeps game status pill on one line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/");
    await setNickname(page, "StatusPlayer");
    await selectPracticeMode(page);
    await page.getByRole("button", { name: "練習を開始" }).click();

    const status = page.locator(".statusPill");
    await expect(status).toBeVisible({ timeout: 7_000 });
    await expect(status).toHaveCSS("white-space", "nowrap");
    await expect(status).toHaveCSS("word-break", "keep-all");

    const geometry = await status.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        left: rect.left,
        right: rect.right,
        viewportWidth: window.innerWidth
      };
    });
    expect(geometry.height).toBeLessThanOrEqual(48);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  });
}
