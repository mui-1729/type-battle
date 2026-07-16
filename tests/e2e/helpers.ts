import type { Page } from "@playwright/test";

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

export async function setNickname(page: Page, nickname: string): Promise<void> {
  await page.getByTitle("設定を開く").click();
  await page.locator(".modalContent input").first().fill(nickname);
  await page.getByRole("button", { name: "設定を反映" }).click();
}
