import { expect, test, type Locator, type Page } from "@playwright/test";
import { readInputGuide, selectBattleMode, selectPracticeMode, setNickname, typeInputGuide } from "./helpers";

const shortViewports = [
  { width: 963, height: 600 },
  { width: 640, height: 600 },
  { width: 480, height: 600 },
  { width: 320, height: 568 }
] as const;

async function expectSingleWorkspaceScroller(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".appShell");
    const workspace = document.querySelector<HTMLElement>(".workspace");
    const scrollOwners = shell
      ? Array.from(shell.querySelectorAll<HTMLElement>("*:not(textarea):not(input)"))
          .filter((element) => {
            const style = getComputedStyle(element);
            return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
          })
          .map((element) => element.className)
      : [];

    return {
      documentWidth: document.documentElement.scrollWidth,
      scrollOwners,
      viewportWidth: window.innerWidth,
      workspaceOverflows: workspace ? workspace.scrollHeight > workspace.clientHeight : false
    };
  });

  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollOwners).toEqual(
    geometry.workspaceOverflows ? [expect.stringContaining("workspace")] : []
  );
}

async function expectReachable(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
}

for (const [index, viewport] of shortViewports.entries()) {
  test(`keeps setup and lobby CTAs usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await setNickname(page, `Short${viewport.width}`);
    await selectBattleMode(page);

    const createButton = page.locator(".roomActions .primaryButton");
    await expectSingleWorkspaceScroller(page);
    await expectReachable(page, createButton);
    if (index % 2 === 0) {
      await createButton.click();
    } else {
      await createButton.focus();
      await createButton.press("Enter");
    }

    const readyButton = page.locator(".lobbyReadyButton");
    await expect(readyButton).toBeVisible();
    await expectSingleWorkspaceScroller(page);
    await expectReachable(page, readyButton);
    if (index % 2 === 0) {
      await readyButton.focus();
      await readyButton.press("Enter");
    } else {
      await readyButton.click();
    }
    await expect(page.locator(".status-countdown, .status-playing").first()).toBeVisible({ timeout: 7_000 });
  });

  test(`keeps match and result CTAs usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await setNickname(page, `Practice${viewport.width}`);
    await selectPracticeMode(page);

    const startButton = page.locator(".difficultySelector .secondaryButton");
    await expectReachable(page, startButton);
    await startButton.click();
    await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
    await expectSingleWorkspaceScroller(page);

    await typeInputGuide(page, await readInputGuide(page));
    await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
    await expectSingleWorkspaceScroller(page);

    const resultButton = page.locator(".practiceResultActions button").last();
    await expectReachable(page, resultButton);
    if (index % 2 === 0) {
      await resultButton.click();
    } else {
      await resultButton.focus();
      await resultButton.press("Enter");
    }
    await expect(page.locator(".soloModePicker")).toBeVisible();
  });
}
