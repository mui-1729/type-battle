import { expect, test } from "@playwright/test";
import { dismissTutorial } from "./helpers";

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 393, height: 852 }
]) {
  test(`keeps home and setup controls reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await dismissTutorial(page);

    const menu = page.locator(".homeModeMenu");
    const logo = page.locator(".homeModeMenu > .gameLogo");
    const wordmark = page.locator(".homeModeMenu > .gameLogo .gameLogoWordmark");
    const battleButton = page.locator(".modeCardBattle .modeCardButton");
    const soloButton = page.locator(".modeCardSolo .modeCardButton");

    await expect(menu).toHaveCSS("overflow-y", "auto");
    const initialGeometry = await page.evaluate(() => {
      const menuElement = document.querySelector<HTMLElement>(".homeModeMenu");
      const logoElement = document.querySelector<HTMLElement>(".homeModeMenu > .gameLogo");
      const wordmarkElement = document.querySelector<HTMLElement>(".homeModeMenu > .gameLogo .gameLogoWordmark");
      const battleElement = document.querySelector<HTMLElement>(".modeCardBattle .modeCardButton");
      const soloElement = document.querySelector<HTMLElement>(".modeCardSolo .modeCardButton");
      if (!menuElement || !logoElement || !wordmarkElement || !battleElement || !soloElement) {
        throw new Error("Expected home mode controls to be rendered.");
      }
      const logoRect = logoElement.getBoundingClientRect();
      const wordmarkRect = wordmarkElement.getBoundingClientRect();
      const battleRect = battleElement.getBoundingClientRect();
      const soloRect = soloElement.getBoundingClientRect();
      return {
        battle: { top: battleRect.top, bottom: battleRect.bottom },
        documentWidth: document.documentElement.scrollWidth,
        logo: { left: logoRect.left, right: logoRect.right },
        menuScrollTop: menuElement.scrollTop,
        solo: { top: soloRect.top, bottom: soloRect.bottom },
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        wordmark: { left: wordmarkRect.left, right: wordmarkRect.right }
      };
    });
    expect(initialGeometry.logo.left).toBeGreaterThanOrEqual(0);
    expect(initialGeometry.logo.right).toBeLessThanOrEqual(initialGeometry.viewportWidth);
    expect(initialGeometry.wordmark.left).toBeGreaterThanOrEqual(0);
    expect(initialGeometry.wordmark.right).toBeLessThanOrEqual(initialGeometry.viewportWidth);
    expect(initialGeometry.documentWidth).toBeLessThanOrEqual(initialGeometry.viewportWidth);
    expect(initialGeometry.battle.top).toBeGreaterThanOrEqual(0);
    expect(initialGeometry.battle.bottom).toBeLessThanOrEqual(initialGeometry.viewportHeight);
    await expect(logo).toBeVisible();
    await expect(wordmark).toBeVisible();
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

    const setupHeader = page.locator(".appShell.isSoloSetup .topBar");
    const backButton = setupHeader.locator(".headerBackButton");
    const settingsButton = setupHeader.locator(".headerActions .iconButton");
    await expect(backButton).toBeVisible();
    await expect(settingsButton).toBeVisible();
    await expect(setupHeader.locator(".brandBlock")).toHaveCSS("display", "none");
    await expect(setupHeader.locator(".connection")).toHaveCSS("display", "none");

    const headerGeometry = await setupHeader.evaluate((header) => {
      const back = header.querySelector<HTMLElement>(".headerBackButton");
      const settings = header.querySelector<HTMLElement>(".headerActions .iconButton");
      if (!back || !settings) {
        throw new Error("Expected setup header controls.");
      }
      const headerRect = header.getBoundingClientRect();
      const backRect = back.getBoundingClientRect();
      const settingsRect = settings.getBoundingClientRect();
      return {
        backCenterY: backRect.top + backRect.height / 2,
        backLeft: backRect.left,
        headerBottom: headerRect.bottom,
        headerTop: headerRect.top,
        settingsCenterY: settingsRect.top + settingsRect.height / 2,
        settingsRight: settingsRect.right,
        viewportWidth: window.innerWidth
      };
    });
    expect(Math.abs(headerGeometry.backCenterY - headerGeometry.settingsCenterY)).toBeLessThanOrEqual(4);
    expect(headerGeometry.backLeft).toBeGreaterThanOrEqual(0);
    expect(headerGeometry.settingsRight).toBeLessThanOrEqual(headerGeometry.viewportWidth);
    expect(headerGeometry.headerBottom - headerGeometry.headerTop).toBeLessThanOrEqual(80);
  });
}
