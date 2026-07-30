import { expect, test, type Page } from "@playwright/test";
import { dismissTutorial, selectBattleMode, setNickname } from "./helpers";

const viewports = [
  { width: 1280, height: 720 },
  { width: 320, height: 568 }
] as const;

async function enterLobby(page: Page, nickname: string): Promise<void> {
  await page.goto("/");
  await dismissTutorial(page);
  await setNickname(page, nickname);
  await selectBattleMode(page);
  await page.locator(".roomActions .primaryButton:not(.joinButton)").click();
  await expect(page.getByTestId("lobby-prep")).toBeVisible();
}

for (const viewport of viewports) {
  test(`keeps equipment controls separate from the figure at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await enterLobby(page, `Equipment${viewport.width}`);

    const localCard = page.locator(".lobbyPlayerCard.hasEquipmentPicker");
    const picker = localCard.locator(".quickEquipmentPicker");
    const figure = localCard.locator(".lobbyFigureArea");
    const header = localCard.locator(".lobbyPlayerCardTop");
    const identity = header.locator(".playerIdentity");
    const waitingBadge = header.locator(".readyBadge");
    await expect(localCard).toHaveCount(1);
    await expect(picker.locator("select")).toHaveCount(2);

    const geometry = await localCard.evaluate((card) => {
      const pickerRect = card.querySelector<HTMLElement>(".quickEquipmentPicker")!.getBoundingClientRect();
      const figureRect = card.querySelector<HTMLElement>(".lobbyFigureArea")!.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(pickerRect.right, figureRect.right) - Math.max(pickerRect.left, figureRect.left));
      const overlapHeight = Math.max(0, Math.min(pickerRect.bottom, figureRect.bottom) - Math.max(pickerRect.top, figureRect.top));
      return {
        figureContained: figureRect.top >= cardRect.top && figureRect.bottom <= cardRect.bottom,
        figureHasArea: figureRect.width > 0 && figureRect.height > 0,
        overlapArea: overlapWidth * overlapHeight,
        pickerFollowsFigure: pickerRect.top >= figureRect.bottom
      };
    });
    expect(geometry).toEqual({
      figureContained: true,
      figureHasArea: true,
      overlapArea: 0,
      pickerFollowsFigure: true
    });

    const headerGeometry = await header.evaluate((headerElement) => {
      const card = headerElement.closest<HTMLElement>(".lobbyPlayerCard")!;
      const identityElement = headerElement.querySelector<HTMLElement>(".playerIdentity")!;
      const badgeElement = headerElement.querySelector<HTMLElement>(".readyBadge")!;
      const figureElement = card.querySelector<HTMLElement>(".lobbyFigureArea")!;
      const cardRect = card.getBoundingClientRect();
      const identityRect = identityElement.getBoundingClientRect();
      const badgeRect = badgeElement.getBoundingClientRect();
      const figureRect = figureElement.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(identityRect.right, badgeRect.right) - Math.max(identityRect.left, badgeRect.left));
      const overlapHeight = Math.max(0, Math.min(identityRect.bottom, badgeRect.bottom) - Math.max(identityRect.top, badgeRect.top));
      return {
        identityAndBadgeDoNotOverlap: overlapWidth * overlapHeight === 0,
        headerFitsCard: identityRect.left >= cardRect.left && badgeRect.right <= cardRect.right,
        figureStartsAfterHeader: figureRect.top >= headerElement.getBoundingClientRect().bottom
      };
    });
    expect(headerGeometry).toEqual({
      identityAndBadgeDoNotOverlap: true,
      headerFitsCard: true,
      figureStartsAfterHeader: true
    });
    await expect(identity).toBeVisible();
    await expect(waitingBadge).toHaveText("WAITING");
    if (viewport.width === 320) {
      const decorationWidth = await localCard.evaluate((card) => getComputedStyle(card, "::before").width);
      expect(decorationWidth).toBe("48px");
    }

    const selects = picker.locator("select");
    await selects.first().selectOption("headband");
    await expect(selects.first()).toHaveValue("headband");

    const pickerWidth = await picker.evaluate((element) => {
      const selectElements = Array.from(element.querySelectorAll<HTMLSelectElement>("select"));
      const headSelect = selectElements[0]!;
      const selectedLabel = headSelect.selectedOptions[0]!.label;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      const style = getComputedStyle(headSelect);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return {
        documentFitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
        headSelectWidth: headSelect.getBoundingClientRect().width,
        headTextWidth: context.measureText(selectedLabel).width,
        pickerFitsCard: element.scrollWidth <= element.clientWidth,
        selectsFitPicker: selectElements.every((select) => select.getBoundingClientRect().right <= element.getBoundingClientRect().right)
      };
    });
    expect(pickerWidth.documentFitsViewport).toBe(true);
    expect(pickerWidth.pickerFitsCard).toBe(true);
    expect(pickerWidth.selectsFitPicker).toBe(true);
    expect(pickerWidth.headSelectWidth).toBeGreaterThanOrEqual(pickerWidth.headTextWidth + 40);

    await selects.first().focus();
    await expect(selects.first()).toBeFocused();
    await selects.first().press("ArrowUp");
    await selects.first().press("Enter");
    await page.keyboard.press("Escape");
    await selects.first().selectOption("headband");

    await localCard.scrollIntoViewIfNeeded();
    const screenshotPath = testInfo.outputPath(`lobby-equipment-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ fullPage: true, path: screenshotPath });
    await testInfo.attach(`lobby-equipment-${viewport.width}x${viewport.height}`, {
      path: screenshotPath,
      contentType: "image/png"
    });

    const settings = page.locator(".lobbySettingsCard");
    const ready = page.locator(".lobbyReadyButton");
    await settings.scrollIntoViewIfNeeded();
    await ready.scrollIntoViewIfNeeded();
    await expect(settings).toBeVisible();
    await expect(ready).toBeVisible();
  });
}
