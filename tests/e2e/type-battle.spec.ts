import { expect, test, type Page } from "@playwright/test";
import {
  closeLatestOpenWebSocket,
  expectFixedViewport,
  installWebSocketProbe,
  readInputGuide,
  readWebSocketProbe,
  selectBattleMode,
  selectDailyMode,
  selectPracticeMode,
  selectSoloMode,
  setNickname,
  typeInputGuide
} from "./helpers";

type ContrastTarget = {
  foreground: string;
  background: string;
  pseudo?: "::after";
};

async function expectReadableContrast(page: Page, targets: ContrastTarget[]): Promise<void> {
  const ratios = await page.evaluate((items) => {
    const parseColor = (color: string) => {
      const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
    };
    const composite = (foreground: number[], background: number[]) => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      return [
        ...foreground.slice(0, 3).map((channel, index) => (
          channel * foreground[3] + background[index] * background[3] * (1 - foreground[3])
        ) / alpha),
        alpha
      ];
    };
    const renderedBackground = (element: Element) => {
      let result = [0, 0, 0, 0];
      let current: Element | null = element;
      while (current) {
        result = composite(result, parseColor(getComputedStyle(current).backgroundColor));
        if (result[3] >= 0.999) {
          return result;
        }
        current = current.parentElement;
      }
      return composite(result, [255, 255, 255, 1]);
    };
    const luminance = (channels: number[]) => channels
      .slice(0, 3)
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);

    return items.map(({ foreground, background, pseudo }) => {
      const foregroundElement = document.querySelector(foreground);
      const backgroundElement = document.querySelector(background);
      if (!foregroundElement || !backgroundElement) {
        return 0;
      }
      const foregroundColor = parseColor(getComputedStyle(foregroundElement, pseudo ?? null).color);
      const backgroundColor = renderedBackground(backgroundElement);
      const foregroundLuminance = luminance(foregroundColor);
      const backgroundLuminance = luminance(backgroundColor);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    });
  }, targets);

  ratios.forEach((ratio) => expect(ratio).toBeGreaterThanOrEqual(4.5));
}

test("shows only one back action on every menu page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /戻る|戻す|選び直す/ })).toHaveCount(0);

  for (const mode of ["対戦する", "ひとりで遊ぶ"] as const) {
    await page.getByRole("button", { name: mode }).click();
    await expect(page.getByRole("button", { name: "モード選択へ" })).toHaveCount(1);
    await expect(page.locator(".headerBackSlot").getByRole("button")).toHaveCount(1);
    await expect(page.locator(".modeBackButton")).toHaveCount(0);
    await page.getByRole("button", { name: "モード選択へ" }).click();
  }

  for (const route of ["/how-to-play", "/feedback"] as const) {
    await page.goto(route);
    await expect(page.getByRole("link", { name: /戻る/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /戻る|戻す|選び直す/ })).toHaveCount(0);
  }
});

test("keeps every setup screen fixed to one viewport", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expectFixedViewport(page);

    await selectSoloMode(page);
    await expect(page.getByRole("heading", { name: "ひとりで遊ぶ" })).toBeVisible();
    await expectFixedViewport(page);

    for (const option of [/練習する/, /今日のチャレンジ/, /ミス詳細/] as const) {
      await page.getByRole("button", { name: option }).click();
      await expectFixedViewport(page);
      await page.getByRole("button", { name: "ひとり用メニューへ" }).click();
    }

    await page.getByRole("button", { name: "モード選択へ" }).click();
    await selectBattleMode(page);
    await expectFixedViewport(page);

    await page.goto("/feedback");
    await expectFixedViewport(page);
  }
});

test("keeps nickname correction available before opening a solo activity", async ({ page }) => {
  await page.goto("/");
  await setNickname(page, "");
  await selectSoloMode(page);

  await page.getByRole("button", { name: /練習する/ }).click();
  const nicknameInput = page.getByLabel("ニックネーム");
  await expect(nicknameInput).toBeVisible();
  await expect(nicknameInput).toBeFocused();
  await expect(page.locator(".errorText")).toBeVisible();

  await nicknameInput.fill("SoloPlayer");
  await page.getByRole("button", { name: /練習する/ }).click();
  await expect(page.getByRole("button", { name: "練習を開始" })).toBeVisible();
});

test("keeps the how-to-play steps readable and paged across screen sizes", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1050, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/how-to-play");

    await expect(page.locator(".howToPlayCard")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "遊び方" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ホームへ戻る" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "モードを選択" })).toBeVisible();
    await page.getByRole("button", { name: "次へ" }).click();
    await expect(page.getByRole("heading", { name: "表示された文字を入力" })).toBeVisible();
    await page.getByRole("button", { name: "3ページ目" }).click();
    await expect(page.getByRole("heading", { name: "結果を確認して再挑戦" })).toBeVisible();
    await expectFixedViewport(page);

    const bodyFontSize = await page.locator(".howToPlayCard > p").evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    expect(bodyFontSize).toBeGreaterThanOrEqual(16);
  }
});

test("creates a room and lets a second player join", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await selectBattleMode(guest);
  await setNickname(guest, "Bob");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();

  await expect(host.getByTestId("lobby-prep").getByText("Bob")).toBeVisible();
  await expect(guest.getByTestId("lobby-prep").getByText("Alice")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("plays a complete two player typing match", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await selectBattleMode(guest);
  await setNickname(guest, "Bob");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();

  await expect(host.getByTestId("lobby-prep").getByText("Bob")).toBeVisible();
  await expect(guest.getByTestId("lobby-prep").getByText("Alice")).toBeVisible();
  await host.getByRole("button", { name: "READYにする" }).click();
  await guest.getByRole("button", { name: "READYにする" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(host.locator(".raceLaneOne strong")).toHaveText("Alice");
  await expect(host.locator(".raceLaneTwo strong")).toHaveText("Bob");
  await expect(guest.locator(".raceLaneOne strong")).toHaveText("Alice");
  await expect(guest.locator(".raceLaneTwo strong")).toHaveText("Bob");

  const hostGuide = await readInputGuide(host);
  const guestGuide = await readInputGuide(guest);
  expect(guestGuide).toBe(hostGuide);

  const hostInput = host.getByLabel("入力欄");
  const guestInput = guest.getByLabel("入力欄");
  const splitIndex = Math.max(2, Math.floor(hostGuide.length / 2));
  await hostInput.pressSequentially(hostGuide.slice(0, splitIndex), { delay: 10 });
  await expect.poll(async () => Number(
    await guest.locator('.raceLaneOne [role="progressbar"]').getAttribute("aria-valuenow")
  )).toBeGreaterThan(0);

  await guestInput.pressSequentially(guestGuide.slice(0, splitIndex), { delay: 10 });
  await expect.poll(async () => Number(
    await host.locator('.raceLaneTwo [role="progressbar"]').getAttribute("aria-valuenow")
  )).toBeGreaterThan(0);

  await Promise.all([
    hostInput.pressSequentially(hostGuide.slice(splitIndex), { delay: 10 }),
    guestInput.pressSequentially(guestGuide.slice(splitIndex), { delay: 10 })
  ]);

  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(guest.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(host.getByText("再戦READY")).toBeVisible();
  await expect(guest.getByText("再戦READY")).toBeVisible();

  const matchSettingsButton = host.getByRole("button", { name: "次の試合設定" });
  const hostDifficultySelector = host.locator(".sidePanel .difficultySelector");
  const [matchSettingsBounds, difficultyBounds] = await Promise.all([
    matchSettingsButton.boundingBox(),
    hostDifficultySelector.boundingBox()
  ]);
  expect(matchSettingsBounds).not.toBeNull();
  expect(difficultyBounds).not.toBeNull();
  expect(
    matchSettingsBounds!.x + matchSettingsBounds!.width > difficultyBounds!.x &&
      matchSettingsBounds!.x < difficultyBounds!.x + difficultyBounds!.width &&
      matchSettingsBounds!.y + matchSettingsBounds!.height > difficultyBounds!.y &&
      matchSettingsBounds!.y < difficultyBounds!.y + difficultyBounds!.height
  ).toBe(false);
  await expect(hostDifficultySelector).toBeVisible();
  await host.evaluate(() => {
    document.documentElement.style.overflow = "clip";
    document.body.style.overflow = "scroll";
    const appShell = document.querySelector<HTMLElement>(".appShell");
    if (appShell) appShell.style.overflow = "auto";
  });
  await matchSettingsButton.click();

  const matchDialog = host.getByRole("dialog", { name: "次の試合設定" });
  const matchHeaderClose = host.getByRole("button", { name: "設定を閉じる" });
  const matchFooterClose = host.getByRole("button", { name: "完了" });
  await expect(matchDialog).toBeVisible();
  await expect(matchHeaderClose).toBeFocused();
  await expect(host.locator("body > .modalBackdrop")).toHaveCount(1);
  await expect(host.locator(".appShell")).toHaveAttribute("inert", "");
  await expect.poll(() => host.evaluate(() => ({
    document: document.documentElement.style.overflow,
    body: document.body.style.overflow,
    appShell: document.querySelector<HTMLElement>(".appShell")?.style.overflow
  }))).toEqual({ document: "hidden", body: "hidden", appShell: "hidden" });

  await host.keyboard.press("Shift+Tab");
  await expect(matchFooterClose).toBeFocused();
  await host.keyboard.press("Tab");
  await expect(matchHeaderClose).toBeFocused();
  await matchDialog.getByLabel("課題カテゴリ").selectOption("long");
  await expect(matchDialog.getByLabel("課題カテゴリ")).toHaveValue("long");
  await matchDialog.getByLabel("COM難易度").selectOption("hard");
  await expect(matchDialog.getByLabel("COM難易度")).toHaveValue("hard");
  await matchDialog.getByRole("button", { name: /^タイムアタック/ }).click();
  await expect(matchDialog.getByRole("button", { name: /^タイムアタック/ })).toHaveClass(/active/);
  await host.keyboard.press("Escape");
  await expect(matchDialog).toBeHidden();
  await expect(matchSettingsButton).toBeFocused();
  await expect(host.locator(".appShell")).not.toHaveAttribute("inert", "");
  await expect.poll(() => host.evaluate(() => ({
    document: document.documentElement.style.overflow,
    body: document.body.style.overflow,
    appShell: document.querySelector<HTMLElement>(".appShell")?.style.overflow
  }))).toEqual({ document: "clip", body: "scroll", appShell: "auto" });

  await matchSettingsButton.click();
  await expect(matchDialog.getByLabel("課題カテゴリ")).toHaveValue("long");
  await expect(matchDialog.getByLabel("COM難易度")).toHaveValue("hard");
  await expect(matchDialog.getByRole("button", { name: /^タイムアタック/ })).toHaveClass(/active/);
  await matchFooterClose.click();
  await expect(matchDialog).toBeHidden();
  await matchSettingsButton.click();
  await matchHeaderClose.click();
  await expect(matchDialog).toBeHidden();
  await matchSettingsButton.click();
  await host.locator(".modalBackdrop").click({ position: { x: 2, y: 2 } });
  await expect(matchDialog).toBeHidden();

  await guest.getByRole("button", { name: "次の試合設定" }).click();
  const guestDialog = guest.getByRole("dialog", { name: "次の試合設定" });
  await expect(guestDialog.getByText("ホストのみ変更できます")).toBeVisible();
  await expect(guestDialog.getByLabel("課題カテゴリ")).toHaveValue("long");
  await expect(guestDialog.getByLabel("COM難易度")).toHaveValue("hard");
  await expect(guestDialog.getByRole("button", { name: /^タイムアタック/ })).toHaveClass(/active/);
  await expect(guestDialog.locator("button:disabled")).toHaveCount(3);
  await expect(guestDialog.locator("select:disabled")).toHaveCount(2);
  await guest.getByRole("button", { name: "完了" }).click();

  await host.getByRole("button", { name: "再戦READY" }).click();
  await expect(host.getByRole("button", { name: "READYを取り消す" })).toBeVisible();
  await guest.getByRole("button", { name: "再戦READY" }).click();
  await expect(host.locator(".status-countdown")).toBeVisible({ timeout: 5_000 });
  await expect(guest.locator(".status-countdown")).toBeVisible({ timeout: 5_000 });
  await expect(host.locator(".resultPanel")).toBeHidden();
  await host.getByRole("button", { name: "対戦を退出" }).click();
  await expect(host.getByRole("dialog", { name: "ルームを退出しますか？" })).toBeVisible();
  await host.getByRole("button", { name: "退出する" }).click();
  await expect(host.getByRole("button", { name: "対戦する" })).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("keeps room exit available on mobile and confirms before leaving", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await selectBattleMode(page);
  await setNickname(page, "MobileHost");
  await page.getByRole("button", { name: "ルームを作成" }).click();

  await expect(page.getByRole("button", { name: "対戦を退出" })).toBeVisible();
  await page.getByRole("button", { name: "対戦を退出" }).click();
  await expect(page.getByRole("dialog", { name: "ルームを退出しますか？" })).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByTestId("lobby-prep")).toBeVisible();

  await page.getByRole("button", { name: "対戦を退出" }).click();
  await page.getByRole("button", { name: "退出する" }).click();
  await expect(page.getByRole("button", { name: "対戦する" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("type-battle:room-code"))).toBeNull();
});

test("does not accept typing while the room exit confirmation is open", async ({ page }) => {
  await page.goto("/");
  await selectBattleMode(page);
  await setNickname(page, "KeyboardHost");
  await page.getByRole("button", { name: "ルームを作成" }).click();
  await page.getByRole("button", { name: /^タイムアタック/ }).click();
  await page.getByRole("button", { name: "READYにする" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const progress = page.locator(".raceLaneOne [role=progressbar]");
  const progressBeforeModal = await progress.getAttribute("aria-valuenow");
  const input = page.getByLabel("入力欄");
  const exitButton = page.getByRole("button", { name: "対戦を退出" });
  await exitButton.click();
  await expect(page.getByRole("dialog", { name: "ルームを退出しますか？" })).toBeVisible();
  await page.keyboard.press("a");
  await page.getByRole("button", { name: "キャンセル" }).focus();
  await page.keyboard.press(" ");
  await expect(page.getByRole("dialog", { name: "ルームを退出しますか？" })).toBeHidden();
  await expect(progress).toHaveAttribute("aria-valuenow", progressBeforeModal ?? "0");
  await expect(input).toBeFocused();

  const guide = await readInputGuide(page);
  await input.fill(guide.slice(0, 5));
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(Number(progressBeforeModal ?? "0"));

  await exitButton.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "ルームを退出しますか？" })).toBeHidden();
  await expect(input).toBeFocused();
});

test("immediately shows the opponent a result after an explicit room exit", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "ExitHost");
  await host.getByRole("button", { name: "ルームを作成" }).click();
  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await selectBattleMode(guest);
  await setNickname(guest, "ExitGuest");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();
  await expect(host.getByTestId("lobby-prep").getByText("ExitGuest")).toBeVisible();
  await host.getByRole("button", { name: "READYにする" }).click();
  await guest.getByRole("button", { name: "READYにする" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  await host.getByRole("button", { name: "対戦を退出" }).click();
  await host.getByRole("button", { name: "退出する" }).click();
  await expect(guest.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(guest.locator(".resultPanel").getByText("FORFEIT", { exact: true })).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test("rejoins the room after reload", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await host.reload();

  // Wait for reconnection to complete
  await expect(host.locator(".connection")).toHaveClass(/isOnline/);
  await expect(host.locator(".roomMeta strong")).toHaveText(roomCode, { timeout: 10_000 });
  await expect(host.getByTestId("lobby-prep").getByText("Alice")).toBeVisible();

  await hostContext.close();
});

test("reconnects the same page after a room WebSocket is interrupted", async ({ browser }) => {
  test.setTimeout(45_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await installWebSocketProbe(guestContext);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "ReconnectHost");
  await host.getByRole("button", { name: "ルームを作成" }).click();
  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await selectBattleMode(guest);
  await setNickname(guest, "ReconnectGuest");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();
  await expect(host.getByTestId("lobby-prep").getByText("ReconnectGuest")).toBeVisible();

  await host.getByRole("button", { name: "READYにする" }).click();
  await guest.getByRole("button", { name: "READYにする" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const guestInput = guest.getByLabel("入力欄");
  const guestGuide = await readInputGuide(guest);
  await guestInput.pressSequentially(guestGuide.slice(0, Math.min(4, guestGuide.length)), { delay: 20 });
  const guestProgressOnHost = host.locator('.raceLaneTwo [role="progressbar"]');
  await expect.poll(async () => Number(await guestProgressOnHost.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  const progressBeforeDisconnect = Number(await guestProgressOnHost.getAttribute("aria-valuenow"));
  const probeBeforeDisconnect = await readWebSocketProbe(guest);

  await closeLatestOpenWebSocket(guest, 3001, "E2E forced disconnect");
  await expect(guest.locator(".connection")).not.toHaveClass(/isOnline/);
  await expect(host.locator(".statusTag.isDisconnected")).toBeVisible();
  await expect(host.locator(".raceLaneTwo .raceRunner")).toHaveAttribute("data-status", "reconnecting");

  await expect(guest.locator(".connection")).toHaveClass(/isOnline/, { timeout: 10_000 });
  await expect.poll(async () => (await readWebSocketProbe(guest)).socketCount).toBeGreaterThan(probeBeforeDisconnect.socketCount);
  await expect.poll(async () => (await readWebSocketProbe(guest)).closeEvents).toContainEqual({
    code: 3001,
    reason: "E2E forced disconnect"
  });
  await expect(host.locator(".statusTag.isDisconnected")).toHaveCount(0, { timeout: 10_000 });
  await expect(host.locator(".raceLaneTwo .raceRunner")).toHaveAttribute("data-status", "active");
  await expect(host.getByTestId("battle-stage")).not.toContainText("再接続中");
  await expect.poll(async () => Number(await guestProgressOnHost.getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(progressBeforeDisconnect);

  await hostContext.close();
  await guestContext.close();
});

test("stops reconnecting when the same session replaces its room socket", async ({ browser }) => {
  const originalContext = await browser.newContext();
  await installWebSocketProbe(originalContext);
  const original = await originalContext.newPage();

  await original.goto("/");
  await selectBattleMode(original);
  await setNickname(original, "SessionOwner");
  await original.getByRole("button", { name: "ルームを作成" }).click();
  const roomCode = await original.locator(".roomMeta strong").innerText();
  const originalStorage = await originalContext.storageState();
  const socketCountBeforeReplacement = (await readWebSocketProbe(original)).socketCount;

  const replacementContext = await browser.newContext({ storageState: originalStorage });
  const replacement = await replacementContext.newPage();
  await replacement.goto("/");
  await expect(replacement.locator(".connection")).toHaveClass(/isOnline/);
  await expect(replacement.locator(".roomMeta strong")).toHaveText(roomCode, { timeout: 10_000 });

  await expect.poll(async () => (await readWebSocketProbe(original)).closeEvents).toContainEqual({
    code: 4000,
    reason: "Rejoined from another socket."
  });
  await expect(original.locator(".connection")).not.toHaveClass(/isOnline/);
  await expect(original.locator(".connection")).toHaveText("未接続");
  await expect(original.locator('[role="status"]').filter({ hasText: "接続が終了しました" })).toBeVisible();
  await expect(original.getByRole("button", { name: "再接続を再試行" })).toBeVisible();
  await original.waitForTimeout(2_500);
  await expect.poll(async () => (await readWebSocketProbe(original)).socketCount).toBe(socketCountBeforeReplacement);
  await expect(replacement.locator(".connection")).toHaveClass(/isOnline/);

  await originalContext.close();
  await replacementContext.close();
});

test("plays all three stage modes against COM and resets between rematches", async ({ browser }) => {
  test.setTimeout(120_000);

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();
  await expect(host.getByRole("button", { name: "READYにする" })).toBeEnabled();

  const modes = [
    { key: "race", label: "レース" },
    { key: "timeAttack", label: "タイムアタック" },
    { key: "hpBattle", label: "HPバトル" }
  ] as const;

  for (const [index, mode] of modes.entries()) {
    if (index === 0) {
      await host.getByRole("button", { name: "READYにする" }).click();
    } else {
      await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
    }
    await expect(host.getByLabel("ルーム操作").getByText("COM (Normal)", { exact: true })).toBeVisible();
    await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

    const stage = host.getByTestId("battle-stage");
    const localPlayer = mode.key === "hpBattle" ? stage.locator(".hpBattlePlayerLeft") : stage.locator(".raceLaneOne");
    const opponentPlayer = mode.key === "hpBattle" ? stage.locator(".hpBattlePlayerRight") : stage.locator(".raceLaneTwo");
    const input = host.getByLabel("入力欄");
    await expect(stage).toHaveAttribute("data-mode", mode.key);
    await expect(stage).toHaveAttribute("data-phase", "playing");
    await expect(localPlayer.locator(".raceLaneIdentity strong, .hpBattleIdentity strong")).toHaveText("Alice");
    await expect(opponentPlayer).toContainText("COM");
    await expect(input).toBeFocused();

    const guide = await readInputGuide(host);
    const splitIndex = Math.max(2, Math.floor(guide.length / 2));
    await input.pressSequentially(guide.slice(0, splitIndex), { delay: 2 });
    await expect.poll(async () => Number(await localPlayer.locator('[role="progressbar"]').getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    await expect(input).toBeFocused();

    if (mode.key === "hpBattle") {
      await expect.poll(async () => Number(await stage.locator(".hpPushStageScene").getAttribute("data-cargo-position")))
        .toBeGreaterThan(50);
    } else {
      await expect.poll(async () => Number(await localPlayer.locator('[role="progressbar"]').getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    }

    if (mode.key === "timeAttack") {
      await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 70_000 });
    } else {
      await input.pressSequentially(guide.slice(splitIndex), { delay: 2 });
      if (mode.key === "hpBattle") {
        for (let attempt = 0; attempt < 12 && !(await host.locator(".resultPanel").isVisible()); attempt += 1) {
          const nextGuide = await readInputGuide(host);
          await input.pressSequentially(nextGuide, { delay: 2, timeout: 2_000 }).catch(async (error: unknown) => {
            if (!(await host.locator(".resultPanel").isVisible())) throw error;
          });
        }
      }
      await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 20_000 });
    }
    await expect(host.getByLabel("試合結果カード").getByText("COM (Normal)", { exact: true })).toBeVisible();

    if (index < modes.length - 1) {
      const nextMode = modes[index + 1];
      await host.getByRole("button", { name: new RegExp("^" + nextMode.label) }).click();
      await host.getByRole("button", { name: "再戦READY" }).click();
      await expect(stage).toHaveAttribute("data-phase", "countdown");
      await expect(stage).toHaveAttribute("data-mode", nextMode.key);
      await expect(stage).toHaveAttribute("data-winner-id", "none");
      await expect(stage).toHaveAttribute("data-result-animation", "idle");
      if (nextMode.key === "hpBattle") {
        await expect(stage.locator('.hpBattlePlayerLeft [role="progressbar"]')).toHaveAttribute("aria-valuenow", "100");
      } else {
        await expect(stage.locator(".raceLaneOne [role=progressbar]")).toHaveAttribute("aria-valuenow", "0");
      }
    }
  }

  await host.reload();
  await expect(host.locator(".connection")).toHaveClass(/isOnline/);
  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 10_000 });

  await hostContext.close();
});

test("forfeits the match after long disconnect", async ({ browser }) => {
  test.setTimeout(60_000);

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "Alice");
  await host.getByRole("button", { name: "ルームを作成" }).click();

  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await selectBattleMode(guest);
  await setNickname(guest, "Bob");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();

  await expect(host.getByTestId("lobby-prep").getByText("Bob")).toBeVisible();
  await expect(guest.getByTestId("lobby-prep").getByText("Alice")).toBeVisible();
  await host.getByRole("button", { name: "READYにする" }).click();
  await guest.getByRole("button", { name: "READYにする" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(guest.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  // Guest disconnects
  await guestContext.close();

  // Should immediately show reconnecting
  await expect(host.locator(".statusTag.isDisconnected")).toBeVisible();
  await expect(host.locator(".rivalBar").getByText("再接続中...")).toBeVisible();
  await expect(host.getByTestId("battle-stage").locator(".raceLaneTwo .raceRunner")).toHaveAttribute(
    "data-status",
    "reconnecting"
  );
  await expect(host.getByTestId("battle-stage")).toContainText("再接続中");

  const localMover = host.locator(".raceLaneOne [role=progressbar]");
  const progressBeforePausedInput = await localMover.getAttribute("aria-valuenow");
  await host.getByTitle("設定を開く").focus();
  await host.keyboard.press("a");
  await expect.poll(() => localMover.getAttribute("aria-valuenow")).toBe(progressBeforePausedInput);

  // Wait for forfeit. Local runs can reuse an existing realtime server with the default 30s grace period.
  const resultPanel = host.getByLabel("試合結果カード");
  await expect(resultPanel).toBeVisible({ timeout: 40_000 });
  await expect(resultPanel.getByText("Bob", { exact: true })).toBeVisible();
  await expect(resultPanel.getByText("FORFEIT", { exact: true })).toBeVisible();
  await expect(resultPanel.getByText("WINNER", { exact: true })).toBeVisible();

  await hostContext.close();
});

test("completes a practice session", async ({ browser }) => {
  const context = await browser.newContext();
  await installWebSocketProbe(context);
  const page = await context.newPage();

  await page.goto("/");
  await page.waitForTimeout(500);
  expect(await readWebSocketProbe(page)).toMatchObject({ socketCount: 0, openSocketCount: 0 });
  await selectPracticeMode(page);
  await setNickname(page, "Alice");
  await expect(page.locator(".connection")).not.toHaveClass(/isOnline/);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(page.locator(".connection")).not.toHaveClass(/isOnline/);
  await expect.poll(async () => (await readWebSocketProbe(page)).openSocketCount).toBe(0);
  expect((await readWebSocketProbe(page)).socketCount).toBe(1);
  await expectFixedViewport(page);
  await expect(page.getByTestId("battle-stage")).toHaveCount(0);

  await typeInputGuide(page, await readInputGuide(page));

  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".resultPanel").getByText("もう一度練習")).toBeVisible();
  expect(await readWebSocketProbe(page)).toMatchObject({ socketCount: 1, openSocketCount: 0 });
  await expectFixedViewport(page);

  const resultPanel = page.locator(".resultPanel");
  const detailsButton = resultPanel.getByRole("button", { name: "詳しい結果" });
  const panelBoxBefore = await resultPanel.boundingBox();
  const documentHeightBefore = await page.evaluate(() => document.documentElement.scrollHeight);

  await detailsButton.click();
  const detailsDialog = page.getByRole("dialog", { name: "詳しい結果" });
  await expect(detailsDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "詳しい結果を閉じる" })).toBeFocused();
  await expect(page.locator(".appShell")).toHaveAttribute("inert", "");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  const panelBoxAfter = await resultPanel.boundingBox();
  expect(panelBoxBefore).not.toBeNull();
  expect(panelBoxAfter).toEqual(panelBoxBefore);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(documentHeightBefore);

  await page.keyboard.press("Escape");
  await expect(detailsDialog).toBeHidden();
  await expect(detailsButton).toBeFocused();

  await context.close();
});

test("can cancel and confirm leaving an active practice session", async ({ page }) => {
  await page.goto("/");
  await selectPracticeMode(page);
  await setNickname(page, "PracticePlayer");
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  const exitButton = page.getByRole("button", { name: "練習をやめる" });
  await exitButton.click();
  const exitDialog = page.getByRole("dialog", { name: "練習をやめますか？" });
  await expect(exitDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "退出確認を閉じる" })).toBeFocused();
  await expect(page.locator(".appShell")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(exitDialog).toBeHidden();
  await expect(page.getByLabel("入力欄")).toBeFocused();
  await expect(page.locator(".status-playing")).toBeVisible();

  await exitButton.click();
  await page.getByRole("button", { name: "練習をやめる" }).last().click();
  await expect(page.getByRole("button", { name: "練習する" })).toBeVisible();
});

test("returns to the solo menu from a daily challenge result", async ({ page }) => {
  await page.goto("/");
  await selectDailyMode(page);
  await setNickname(page, "DailyPlayer");
  await page.getByRole("button", { name: "今日の挑戦を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  await typeInputGuide(page, await readInputGuide(page));
  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await page.locator(".resultPanel").getByRole("button", { name: "ひとり用メニューへ" }).click();
  await expect(page.getByRole("button", { name: "今日のチャレンジ" })).toBeVisible();
});

test("disables stage motion for the player setting and OS preference", async ({ browser }) => {
  for (const source of ["setting", "os"] as const) {
    const context = await browser.newContext(source === "os" ? { reducedMotion: "reduce" } : {});
    const page = await context.newPage();
    await page.goto("/");

    if (source === "setting") {
      await page.getByTitle("設定を開く").click();
      await page.getByLabel("アニメーションを減らす").check();
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
      await expect(page.locator("html")).toHaveClass(/reduced-motion/);
    }

    await selectBattleMode(page);
    await setNickname(page, source === "setting" ? "Reduced" : "SystemReduced");
    await page.getByRole("button", { name: "ルームを作成" }).click();
    await page.getByRole("button", { name: "READYにする" }).click();
    await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

    const motion = await page.locator(".raceLaneOne .raceRunner").evaluate((element) => {
      const moverStyle = getComputedStyle(element);
      const figureBody = element.querySelector(".stickFigureBody");
      return {
        transitionDuration: moverStyle.transitionDuration,
        animationName: figureBody ? getComputedStyle(figureBody).animationName : "missing"
      };
    });
    expect(Number.parseFloat(motion.transitionDuration)).toBeLessThan(0.001);
    expect(motion.animationName).toBe("none");

    await context.close();
  }
});

test("saves and restores player settings from localStorage", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  
  // Open settings
  await page.getByTitle("設定を開く").click();
  await expect(page.getByText("プレイヤー設定")).toBeVisible();

  // Change nickname
  await page.locator(".modalContent input").first().fill("Charlie");
  
  // Toggle dark theme
  await page.getByRole("button", { name: "ダーク" }).click();
  
  // Change font size
  await page.getByRole("button", { name: "大" }).click();

  // Close modal
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByText("プレイヤー設定")).not.toBeVisible();

  // Verify UI reflects changes
  await page.getByTitle("設定を開く").click();
  await expect(page.locator(".modalContent input").first()).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();

  // Reload and verify persistence
  await page.reload();
  await page.getByTitle("設定を開く").click();
  await expect(page.locator(".modalContent input").first()).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);

  await context.close();
});

test("keeps explicit and system dark theme text readable", async ({ browser }) => {
  const systemContext = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 390, height: 844 }
  });
  const systemPage = await systemContext.newPage();
  await systemPage.goto("/");
  await selectSoloMode(systemPage);
  await expectFixedViewport(systemPage);
  await expect(systemPage.locator(".soloModeOption").first()).toHaveCSS("background-color", "rgb(14, 30, 54)");
  await expectReadableContrast(systemPage, [
    { foreground: ".soloModeOptionCopy small", background: ".soloModeOption" },
    { foreground: ".soloModeOptionCopy strong", background: ".soloModeOption" },
    { foreground: ".soloModeOptionCopy span", background: ".soloModeOption" }
  ]);

  await systemPage.getByRole("button", { name: /今日のチャレンジ/ }).click();
  await expectReadableContrast(systemPage, [
    { foreground: ".dailyChallengePanel > .sectionHeading", background: ".dailyChallengePanel", pseudo: "::after" },
    { foreground: ".dailyChallengeHeader small", background: ".dailyChallengePanel" },
    { foreground: ".dailyChallengeStats span", background: ".dailyChallengePanel" }
  ]);
  await systemPage.goto("/feedback");
  await expectFixedViewport(systemPage);
  await expectReadableContrast(systemPage, [
    { foreground: ".feedbackCardHeading > p:last-child", background: ".feedbackCard" },
    { foreground: ".feedbackKinds small", background: ".feedbackKinds > div" }
  ]);
  await systemContext.close();

  const darkSettings = JSON.stringify({
    nickname: "Player",
    theme: "dark",
    soundEnabled: true,
    countdownSoundEnabled: true,
    reactionsEnabled: true,
    inputGuideEnabled: true,
    reducedMotion: false,
    fontSize: "normal",
    tutorialSeen: false
  });
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await hostContext.addInitScript((settings) => localStorage.setItem("type-battle:settings", settings), darkSettings);
  await guestContext.addInitScript((settings) => localStorage.setItem("type-battle:settings", settings), darkSettings);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await host.getByRole("button", { name: "ルームを作成" }).click();
  const roomCode = await host.locator(".roomMeta strong").innerText();
  await guest.goto("/");
  await selectBattleMode(guest);
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();
  await expect(host.locator(".lobbyPlayerCard")).toHaveCount(2);

  await expectReadableContrast(host, [
    { foreground: ".lobbyPlayerCard .playerIdentityRole", background: ".lobbyPlayerCard" },
    { foreground: ".lobbyPlayerCard:last-child .playerIdentityRole", background: ".lobbyPlayerCard:last-child" }
  ]);
  await host.getByRole("button", { name: "READYにする" }).click();
  await expect(host.locator(".lobbyPlayerCard .readyBadge.active")).toBeVisible();
  await expectReadableContrast(host, [
    { foreground: ".lobbyPlayerCard .readyBadge.active", background: ".lobbyPlayerCard" }
  ]);

  await guest.getByRole("button", { name: "READYにする" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expectReadableContrast(host, [
    { foreground: ".raceLaneTwo .raceLaneIdentity strong", background: ".raceLaneTwo" }
  ]);

  await hostContext.close();
  await guestContext.close();
});

test("contains settings focus and restores focus and scroll state on Escape", async ({ page }) => {
  await page.goto("/");
  const settingsButton = page.getByTitle("設定を開く");
  await settingsButton.focus();
  await page.evaluate(() => {
    document.documentElement.style.overflow = "clip";
    document.body.style.overflow = "scroll";
    const appShell = document.querySelector<HTMLElement>(".appShell");
    if (appShell) {
      appShell.style.overflow = "auto";
    }
  });

  await settingsButton.click();
  const dialog = page.getByRole("dialog", { name: "プレイヤー設定" });
  const headerCloseButton = page.getByRole("button", { name: "設定を閉じる" });
  const footerCloseButton = page.getByRole("button", { name: "閉じる", exact: true });

  await expect(dialog).toBeVisible();
  await expect(headerCloseButton).toBeFocused();
  await expect(page.locator(".appShell")).toHaveAttribute("inert", "");
  await expect.poll(() => page.evaluate(() => ({
    document: document.documentElement.style.overflow,
    body: document.body.style.overflow,
    appShell: document.querySelector<HTMLElement>(".appShell")?.style.overflow
  }))).toEqual({ document: "hidden", body: "hidden", appShell: "hidden" });

  await page.keyboard.press("Shift+Tab");
  await expect(footerCloseButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(headerCloseButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();
  await expect(page.locator(".appShell")).not.toHaveAttribute("inert", "");
  await expect.poll(() => page.evaluate(() => ({
    document: document.documentElement.style.overflow,
    body: document.body.style.overflow,
    appShell: document.querySelector<HTMLElement>(".appShell")?.style.overflow
  }))).toEqual({ document: "clip", body: "scroll", appShell: "auto" });
});
