import { expect, test } from "@playwright/test";
import { dismissTutorial, selectBattleMode, selectSoloMode } from "./helpers";

for (const setup of [
  { name: "battle", shell: ".appShell.isBattleSetup", open: selectBattleMode },
  { name: "solo", shell: ".appShell.isSoloSetup", open: selectSoloMode }
] as const) {
  for (const width of [320, 390, 393]) {
    test(`keeps ${setup.name} setup header on one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/");
      await dismissTutorial(page);
      await setup.open(page);

      const header = page.locator(`${setup.shell} .topBar`);
      const back = header.locator(".headerBackButton");
      const settings = header.locator(".headerActions .iconButton");

      await expect(header).toHaveCSS("flex-direction", "row");
      await expect(header.locator(".brandBlock")).toHaveCSS("display", "none");
      await expect(header.locator(".connection")).toHaveCSS("display", "none");
      await expect(back).toBeVisible();
      await expect(settings).toBeVisible();

      const geometry = await header.evaluate((element) => {
        const backButton = element.querySelector<HTMLElement>(".headerBackButton");
        const settingsButton = element.querySelector<HTMLElement>(".headerActions .iconButton");
        if (!backButton || !settingsButton) {
          throw new Error("Expected setup header controls.");
        }
        const headerRect = element.getBoundingClientRect();
        const backRect = backButton.getBoundingClientRect();
        const settingsRect = settingsButton.getBoundingClientRect();
        return {
          backCenterY: backRect.top + backRect.height / 2,
          backLeft: backRect.left,
          documentWidth: document.documentElement.scrollWidth,
          headerHeight: headerRect.height,
          settingsCenterY: settingsRect.top + settingsRect.height / 2,
          settingsRight: settingsRect.right,
          viewportWidth: window.innerWidth
        };
      });

      expect(Math.abs(geometry.backCenterY - geometry.settingsCenterY)).toBeLessThanOrEqual(4);
      expect(geometry.backLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.settingsRight).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.headerHeight).toBeLessThanOrEqual(80);
    });
  }
}
