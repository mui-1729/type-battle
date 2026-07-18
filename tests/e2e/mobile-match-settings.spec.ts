import { expect, test } from "@playwright/test";
import { selectBattleMode, setNickname } from "./helpers";

test("keeps the match settings overlay contained and scrollable on mobile", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await selectBattleMode(host);
  await setNickname(host, "MobileHost");
  await host.getByRole("button", { name: "ルームを作成" }).click();
  const roomCode = await host.locator(".roomMeta strong").innerText();

  await guest.goto("/");
  await selectBattleMode(guest);
  await setNickname(guest, "MobileGuest");
  await guest.getByLabel("ルームコード").fill(roomCode);
  await guest.getByTitle("ルームに参加").click();
  await host.getByRole("button", { name: "READYにする" }).click();
  await guest.getByRole("button", { name: "READYにする" }).click();
  await expect(host.locator(".status-playing")).toBeVisible({ timeout: 7_000 });

  await guest.getByRole("button", { name: "対戦を退出" }).click();
  await guest.getByRole("button", { name: "退出する" }).click();
  await expect(host.locator(".resultPanel")).toBeVisible({ timeout: 5_000 });

  const opener = host.getByRole("button", { name: "次の試合設定" });
  await opener.click();
  const dialog = host.getByRole("dialog", { name: "次の試合設定" });
  await expect(dialog).toBeVisible();
  await expect(host.locator("body > .modalBackdrop")).toHaveCount(1);
  await expect(host.locator(".appShell")).toHaveAttribute("inert", "");

  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.overflowY).toBe("auto");
  expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight);

  await host.keyboard.press("Shift+Tab");
  await expect(host.getByRole("button", { name: "完了" })).toBeFocused();
  await host.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(host.locator(".appShell")).not.toHaveAttribute("inert", "");

  await hostContext.close();
  await guestContext.close();
});
