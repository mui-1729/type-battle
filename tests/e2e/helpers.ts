import { expect, type Page } from "@playwright/test";

export async function expectFixedViewport(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".appShell");
    const outsideControls = Array.from(document.querySelectorAll<HTMLElement>(".appShell button, .appShell a, .appShell input, .appShell select"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity) > 0.05 &&
          style.pointerEvents !== "none" &&
          rect.width > 0 &&
          rect.height > 0;
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth;
      })
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? element.tagName);

    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      shellScrollTop: shell?.scrollTop ?? 0,
      shellScrollLeft: shell?.scrollLeft ?? 0,
      outsideControls
    };
  });

  expect(metrics.documentHeight).toBe(metrics.viewportHeight);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.shellScrollTop).toBe(0);
  expect(metrics.shellScrollLeft).toBe(0);
  expect(metrics.outsideControls).toEqual([]);
}

export async function readInputGuide(page: Page): Promise<string> {
  return (await page.getByLabel("入力ガイド").innerText()).replace(/\s+/g, "");
}

export async function typeInputGuide(page: Page, guide: string): Promise<void> {
  await page.getByLabel("入力欄").pressSequentially(guide, { delay: 40 });
}

export async function selectBattleMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "対戦する" }).click();
}

export async function selectSoloMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "ひとりで遊ぶ" }).click();
}

export async function selectPracticeMode(page: Page): Promise<void> {
  await selectSoloMode(page);
  await page.getByRole("button", { name: /練習する/ }).click();
}

export async function selectDailyMode(page: Page): Promise<void> {
  await selectSoloMode(page);
  await page.getByRole("button", { name: /今日のチャレンジ/ }).click();
}

export async function setNickname(page: Page, nickname: string): Promise<void> {
  await page.getByTitle("設定を開く").click();
  await page.locator(".modalContent input").first().fill(nickname);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
}
