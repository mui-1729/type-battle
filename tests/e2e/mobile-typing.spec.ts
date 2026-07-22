import { expect, test } from "@playwright/test";
import {
  expectFixedViewport,
  installWebSocketProbe,
  readWebSocketProbe,
  selectBattleMode,
  selectPracticeMode,
  setNickname
} from "./helpers";

test("completes practice with mobile Japanese textarea input", async ({ page }) => {
  await installWebSocketProbe(page.context());
  await page.goto("/");
  await page.waitForTimeout(500);
  expect(await readWebSocketProbe(page)).toMatchObject({ socketCount: 0, openSocketCount: 0 });
  await selectPracticeMode(page);
  await setNickname(page, "Mobile");
  await expect(page.locator(".connection")).not.toHaveClass(/isOnline/);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(page.locator(".connection")).not.toHaveClass(/isOnline/);
  await expect.poll(async () => (await readWebSocketProbe(page)).openSocketCount).toBe(0);
  expect((await readWebSocketProbe(page)).socketCount).toBe(1);
  await expectFixedViewport(page);

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
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
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
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await selectPracticeMode(page);
    await setNickname(page, "KeyboardPlayer");
    await page.getByRole("button", { name: "練習を開始" }).click();
    await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

    await page.evaluate(() => {
      (window as typeof window & { simulateSoftwareKeyboard: (height: number) => void }).simulateSoftwareKeyboard(500);
    });
    await page.getByLabel("入力欄").focus();

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
  }
});

test("keeps the COM battle stage inside a 390px mobile viewport", async ({ page }) => {
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

  await expect.poll(async () => {
    const cargoPosition = Number(await stage.locator(".hpPushStageScene").getAttribute("data-cargo-position"));
    return Number.isFinite(cargoPosition) && cargoPosition >= 20 && cargoPosition <= 80;
  }).toBe(true);
  await expect(textarea).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
});
