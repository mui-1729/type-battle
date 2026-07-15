import { expect, test } from "@playwright/test";

async function selectSoloMode(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "ひとりで遊ぶ" }).click();
}

async function selectBattleMode(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "対戦する" }).click();
}

async function setNickname(page: import("@playwright/test").Page, nickname: string): Promise<void> {
  await page.getByTitle("設定を開く").click();
  await page.locator(".modalContent input").first().fill(nickname);
  await page.getByRole("button", { name: "設定を反映" }).click();
}

test("completes practice with mobile Japanese textarea input", async ({ page }) => {
  await page.goto("/");
  await selectSoloMode(page);
  await setNickname(page, "Mobile");
  await expect(page.locator(".connection")).toHaveClass(/isOnline/);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const guide = (await page.getByLabel("入力ガイド").innerText()).replace(/\s+/g, "");
  const textarea = page.getByLabel("入力欄");
  const compositionChunk = guide.slice(0, 2);
  const remainingGuide = guide.slice(compositionChunk.length);

  await expect(textarea).toBeEditable();
  await expect(page.locator(".progressLabel strong")).toHaveText("0%");

  await textarea.evaluate((element, value) => {
    const input = element as HTMLTextAreaElement;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, isComposing: true }));
  }, compositionChunk);
  await expect(page.locator(".progressLabel strong")).toHaveText("0%");

  await textarea.evaluate((element, value) => {
    const input = element as HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: value }));
  }, compositionChunk);
  await expect(page.locator(".progressLabel strong")).not.toHaveText("0%");

  await textarea.pressSequentially(remainingGuide, { delay: 1 });

  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".resultPanel").getByText("もう一度練習")).toBeVisible();
});

test("keeps the COM battle stage inside a 390px mobile viewport", async ({ page }) => {
  await page.goto("/");
  await selectBattleMode(page);
  const nickname = "MobilePlayerLong18";
  await setNickname(page, nickname);
  await page.getByRole("button", { name: "ルームを作成" }).click();
  await page.getByRole("button", { name: /^HPバトル/ }).click();
  await page.getByRole("button", { name: "COM と開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const stage = page.getByTestId("battle-stage");
  const textarea = page.getByLabel("入力欄");
  await expect(stage).toHaveAttribute("data-mode", "hpBattle");
  await expect(stage.locator('.battleStagePlayerMover[data-side="left"] strong')).toHaveAttribute("title", nickname);
  await expect(textarea).toBeFocused();

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(viewport).toEqual({ width: 390, height: 844, clientWidth: 390, scrollWidth: 390 });

  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((stageBox?.x ?? 0) + (stageBox?.width ?? 0)).toBeLessThanOrEqual(390);

  const guide = (await page.getByLabel("入力ガイド").innerText()).replace(/\s+/g, "");
  const firstCharacter = guide.slice(0, 1);
  await textarea.evaluate((element, value) => {
    const input = element as HTMLTextAreaElement;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, isComposing: true }));
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: value }));
  }, firstCharacter);

  await expect.poll(async () => Number(await stage.locator(".hpPushStageScene").getAttribute("data-cargo-position")))
    .toBeGreaterThan(50);
  await expect(textarea).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
});
