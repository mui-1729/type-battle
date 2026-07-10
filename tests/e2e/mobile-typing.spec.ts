import { expect, test } from "@playwright/test";

test("completes practice with mobile Japanese textarea input", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("ニックネーム").fill("Mobile");
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
