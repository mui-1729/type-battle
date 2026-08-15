import { PROMPTS } from "@type-battle/shared";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectElementsNotToOverlap,
  expectFixedViewport,
  installWebSocketProbe,
  readWebSocketProbe,
  selectBattleMode,
  selectPracticeMode,
  setNickname
} from "./helpers";

async function readActiveKana(page: Page): Promise<string> {
  const displayText = await page.locator(".promptDisplay").innerText();
  const prompt = PROMPTS.find((candidate) => candidate.text === displayText);
  if (!prompt) {
    throw new Error(`Could not resolve prompt fixture for: ${displayText}`);
  }
  return prompt.typing.hiragana;
}

async function commitKanaInput(textarea: Locator, value: string): Promise<void> {
  await textarea.evaluate((element, text) => {
    const input = element as HTMLTextAreaElement;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    input.value = text;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, isComposing: true }));
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
  }, value);
}

test("completes practice with actual mobile kana IME input", async ({ page }) => {
  await installWebSocketProbe(page.context());
  await page.goto("/");
  await page.waitForTimeout(500);
  expect(await readWebSocketProbe(page)).toMatchObject({ socketCount: 0, openSocketCount: 0 });
  await setNickname(page, "Mobile");
  await selectPracticeMode(page);
  await expect(page.locator(".connection")).not.toHaveClass(/isOnline/);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expectElementsNotToOverlap(page, ".headerBackButton", ".statusPill");
  await expect(page.locator(".connection")).not.toHaveClass(/isOnline/);
  await expect.poll(async () => (await readWebSocketProbe(page)).openSocketCount).toBe(0);
  expect((await readWebSocketProbe(page)).socketCount).toBe(1);
  await expectFixedViewport(page);

  const kanaText = await readActiveKana(page);
  const textarea = page.getByLabel("入力欄");
  expect(kanaText).toMatch(/[\u3040-\u30ff]/u);
  expect(kanaText).toContain("、");

  await expect(textarea).toBeEditable();
  await expect(page.locator(".progressLabel strong")).toHaveText("0%");

  await commitKanaInput(textarea, Array.from(kanaText)[0]!);
  await expect(page.locator(".progressLabel strong")).not.toHaveText("0%");

  for (const character of Array.from(kanaText).slice(1)) {
    await commitKanaInput(textarea, character);
  }

  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".resultPanel").getByText("もう一度練習")).toBeVisible();
  await expectFixedViewport(page);

  const resultPanel = page.locator(".resultPanel");
  const panelHeightBefore = await resultPanel.evaluate((element) => element.getBoundingClientRect().height);
  await resultPanel.getByRole("button", { name: "詳しい結果" }).click();
  const detailsDialog = page.getByRole("dialog", { name: "詳しい結果" });
  await expect(detailsDialog).toBeVisible();
  expect(await resultPanel.evaluate((element) => element.getBoundingClientRect().height)).toBe(panelHeightBefore);

  const dialogBox = await detailsDialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 390);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("supports physical-keyboard romaji input on a mobile device", async ({ page }) => {
  await page.goto("/");
  await setNickname(page, "MobileRomaji");
  await selectPracticeMode(page);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const guide = (await page.getByLabel("入力ガイド").innerText()).replace(/\s+/g, "");
  const textarea = page.getByLabel("入力欄");
  await textarea.pressSequentially(guide, { delay: 1 });

  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
});

test("keeps the typing prompt reachable when the software keyboard reduces the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget() as EventTarget & { height: number };
    viewport.height = window.innerHeight;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    Object.defineProperty(window, "simulateSoftwareKeyboard", {
      configurable: true,
      value: (height: number) => {
        viewport.height = height;
        viewport.dispatchEvent(new Event("resize"));
      }
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await setNickname(page, "KeyboardPlayer");
  await selectPracticeMode(page);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  await page.evaluate(() => {
    (window as typeof window & { simulateSoftwareKeyboard: (height: number) => void }).simulateSoftwareKeyboard(500);
  });
  await page.getByLabel("入力欄").focus();

  await expect.poll(async () => page.locator(".matchSurface").evaluate((surface) => {
    const prompt = surface.querySelector<HTMLElement>(".promptBox");
    const promptRect = prompt?.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    return Boolean(
      promptRect &&
      promptRect.top >= surfaceRect.top &&
      promptRect.bottom <= Math.min(surfaceRect.bottom, 500)
    );
  })).toBe(true);

  const metrics = await page.locator(".matchSurface").evaluate((surface) => {
    const prompt = surface.querySelector<HTMLElement>(".promptBox");
    const promptRect = prompt?.getBoundingClientRect();
    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      shellHeight: document.querySelector<HTMLElement>(".appShell")?.clientHeight ?? 0,
      surfaceScrollHeight: surface.scrollHeight,
      surfaceClientHeight: surface.clientHeight,
      promptTop: promptRect?.top ?? -1,
      promptBottom: promptRect?.bottom ?? Number.POSITIVE_INFINITY
    };
  });

  expect(metrics.documentHeight).toBe(metrics.viewportHeight);
  expect(metrics.shellHeight).toBe(500);
  expect(metrics.surfaceScrollHeight).toBeGreaterThan(metrics.surfaceClientHeight);
  expect(metrics.promptTop).toBeGreaterThanOrEqual(0);
  expect(metrics.promptBottom).toBeLessThanOrEqual(metrics.shellHeight);
});

test("keeps the COM battle stage inside a mobile viewport with kana input", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await selectBattleMode(page);
  const nickname = "MobilePlayerLong18";
  await setNickname(page, nickname);
  await page.getByRole("button", { name: "ルームを作成" }).click();
  await page.getByRole("button", { name: /^HPバトル/ }).click();
  await page.getByRole("button", { name: "READYにする" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const stage = page.getByTestId("battle-stage");
  const textarea = page.getByLabel("入力欄");
  await expect(stage).toHaveAttribute("data-mode", "hpBattle");
  await expect(stage.locator(".hpBattlePlayerLeft .hpBattleIdentity strong")).toHaveAttribute("title", nickname);
  await expect(textarea).toBeFocused();

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
  expect(viewport.width).toBe(viewport.clientWidth);

  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((stageBox?.x ?? 0) + (stageBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width);

  const kanaText = await readActiveKana(page);
  for (const character of kanaText) {
    await commitKanaInput(textarea, character);
    await page.waitForTimeout(300);
  }

  const opponentHp = stage.locator(".hpBattlePlayerRight [role=progressbar]");
  const hpAfterFirstCycle = Number(await opponentHp.getAttribute("aria-valuenow"));
  await expect(page.locator(".resultPanel")).not.toBeVisible();
  await page.waitForTimeout(2_000);
  for (const character of Array.from(kanaText).slice(0, 3)) {
    await commitKanaInput(textarea, character);
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => Number(await opponentHp.getAttribute("aria-valuenow")))
    .toBeLessThan(hpAfterFirstCycle);
  await expect(page.locator(".resultPanel")).not.toBeVisible();

  await expect.poll(async () => {
    const cargoPosition = Number(await stage.locator(".hpPushStageScene").getAttribute("data-cargo-position"));
    return Number.isFinite(cargoPosition) && cargoPosition >= 20 && cargoPosition <= 80;
  }).toBe(true);
  await expect(textarea).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
});
