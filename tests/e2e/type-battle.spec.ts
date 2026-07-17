import { expect, test } from "@playwright/test";
import {
  readInputGuide,
  selectBattleMode,
  selectSoloMode,
  setNickname,
  typeInputGuide
} from "./helpers";

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

test("keeps the how-to-play steps readable across screen sizes", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900, expectedColumnCount: 3 },
    { width: 1050, height: 900, expectedColumnCount: 1 },
    { width: 390, height: 844, expectedColumnCount: 1 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/how-to-play");

    await expect(page.locator(".howToPlayCard")).toHaveCount(3);
    await expect(page.getByRole("heading", { level: 1, name: "遊び方" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ホームへ戻る" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const gridColumnCount = await page.locator(".howToPlayGrid").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
    );
    expect(gridColumnCount).toBe(viewport.expectedColumnCount);

    const bodyFontSizes = await page.locator(".howToPlayCard > p").evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    );
    expect(bodyFontSizes.every((fontSize) => fontSize >= 16)).toBe(true);
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

  await Promise.all([
    typeInputGuide(host, hostGuide),
    typeInputGuide(guest, guestGuide)
  ]);

  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(guest.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(host.getByText("再戦READY")).toBeVisible();
  await expect(guest.getByText("再戦READY")).toBeVisible();
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
          await input.pressSequentially(await readInputGuide(host), { delay: 2 });
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
  await expect(host.locator(".statusTag.isForfeited")).toBeVisible({ timeout: 40_000 });
  await expect(host.locator(".rivalBar").getByText("棄権")).toBeVisible();
  await expect(host.getByTestId("battle-stage").locator(".raceLaneTwo .raceRunner")).toHaveAttribute(
    "data-status",
    "forfeited"
  );
  await expect(host.getByTestId("battle-stage")).toContainText("棄権");

  await hostContext.close();
});

test("completes a practice session", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  await selectSoloMode(page);
  await setNickname(page, "Alice");
  await expect(page.locator(".connection")).toHaveClass(/isOnline/);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await expect(page.getByTestId("battle-stage")).toHaveCount(0);

  await typeInputGuide(page, await readInputGuide(page));

  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".resultPanel").getByText("もう一度練習")).toBeVisible();

  await context.close();
});

test("can cancel and confirm leaving an active practice session", async ({ page }) => {
  await page.goto("/");
  await selectSoloMode(page);
  await setNickname(page, "PracticePlayer");
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  await page.getByRole("button", { name: "練習をやめる" }).click();
  await expect(page.getByRole("dialog", { name: "練習をやめますか？" })).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.locator(".status-playing")).toBeVisible();

  await page.getByRole("button", { name: "練習をやめる" }).click();
  await page.getByRole("button", { name: "練習をやめる" }).last().click();
  await expect(page.getByRole("button", { name: "練習を開始" })).toBeVisible();
});

test("returns to the solo menu from a daily challenge result", async ({ page }) => {
  await page.goto("/");
  await selectSoloMode(page);
  await setNickname(page, "DailyPlayer");
  await page.getByRole("button", { name: "今日の挑戦を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  await typeInputGuide(page, await readInputGuide(page));
  await expect(page.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });
  await page.locator(".resultPanel").getByRole("button", { name: "ひとり用メニューへ" }).click();
  await expect(page.getByRole("button", { name: "今日の挑戦を開始" })).toBeVisible();
});

test("disables stage motion for the player setting and OS preference", async ({ browser }) => {
  for (const source of ["setting", "os"] as const) {
    const context = await browser.newContext(source === "os" ? { reducedMotion: "reduce" } : {});
    const page = await context.newPage();
    await page.goto("/");

    if (source === "setting") {
      await page.getByTitle("設定を開く").click();
      await page.getByLabel("アニメーションを減らす").check();
      await page.getByRole("button", { name: "設定を反映" }).click();
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
  await page.getByRole("button", { name: "設定を反映" }).click();
  await expect(page.getByText("プレイヤー設定")).not.toBeVisible();

  // Verify UI reflects changes
  await page.getByTitle("設定を開く").click();
  await expect(page.locator(".modalContent input").first()).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);
  await page.getByRole("button", { name: "設定を反映" }).click();

  // Reload and verify persistence
  await page.reload();
  await page.getByTitle("設定を開く").click();
  await expect(page.locator(".modalContent input").first()).toHaveValue("Charlie");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await expect(page.locator("html")).toHaveClass(/font-large/);

  await context.close();
});
