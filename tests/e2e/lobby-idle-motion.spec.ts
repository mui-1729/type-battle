import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissTutorial, selectBattleMode, setNickname } from "./helpers";

async function openWaitingLobby(page: Page): Promise<void> {
  await page.goto("/");
  await selectBattleMode(page);
  await setNickname(page, "IdleMotion");
  await page.getByRole("button", { name: "ルームを作成" }).click();
  await expect(page.getByTestId("lobby-prep")).toBeVisible();
}

async function readIdleLegMotion(page: Page): Promise<string[]> {
  return page.locator(".lobbyFigureArea .stickFigure[data-pose=idle]").evaluate((figure) => (
    [".stickFigureLegFront", ".stickFigureLegBack"].map((selector) => {
      const leg = figure.querySelector(selector);
      return leg ? getComputedStyle(leg).animationName : "missing";
    })
  ));
}

test("animates only the waiting lobby player's legs without changing the running pose", async ({ page }) => {
  await openWaitingLobby(page);

  await expect.poll(() => readIdleLegMotion(page)).toEqual([
    "lobbyIdleStepFront",
    "lobbyIdleStepBack"
  ]);
  await expect(page.locator(".lobbyFigureArea .stickFigure[data-pose=run]")).toHaveCount(0);

  const firstTransform = await page.locator(".lobbyFigureArea .stickFigureLegFront").evaluate((leg) => getComputedStyle(leg).transform);
  await page.waitForTimeout(500);
  const secondTransform = await page.locator(".lobbyFigureArea .stickFigureLegFront").evaluate((leg) => getComputedStyle(leg).transform);
  expect(secondTransform).not.toBe(firstTransform);
});

test("stops lobby idle feet for the player setting and OS reduced-motion preference", async ({ browser }) => {
  for (const source of ["setting", "os"] as const) {
    const context: BrowserContext = await browser.newContext(source === "os" ? { reducedMotion: "reduce" } : {});
    const page = await context.newPage();
    await page.goto("/");

    if (source === "setting") {
      await dismissTutorial(page);
      await page.getByTitle("設定を開く").click();
      await page.getByLabel("アニメーションを減らす").check();
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
      await expect(page.locator("html")).toHaveClass(/reduced-motion/);
    }

    await selectBattleMode(page);
    await setNickname(page, `Idle${source}`);
    await page.getByRole("button", { name: "ルームを作成" }).click();
    await expect(page.getByTestId("lobby-prep")).toBeVisible();
    await expect.poll(() => readIdleLegMotion(page)).toEqual(["none", "none"]);
    await context.close();
  }
});

test("keeps the idle animation contained on a 320px-wide lobby", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const page = await context.newPage();
  await openWaitingLobby(page);

  await expect.poll(() => readIdleLegMotion(page)).toEqual([
    "lobbyIdleStepFront",
    "lobbyIdleStepBack"
  ]);
  const geometry = await page.locator(".lobbyFigureArea .stickFigure[data-pose=idle]").evaluate((figure) => {
    const figureRect = figure.getBoundingClientRect();
    const areaRect = figure.parentElement?.getBoundingClientRect();
    return {
      withinViewport: figureRect.left >= 0 && figureRect.right <= window.innerWidth,
      withinArea: Boolean(areaRect && figureRect.left >= areaRect.left && figureRect.right <= areaRect.right)
    };
  });
  expect(geometry).toEqual({ withinViewport: true, withinArea: true });
  await page.screenshot({ path: "test-results/lobby-idle-motion-320x568.png", fullPage: false });
  await context.close();
});
