import { expect, test } from "@playwright/test";
import { dismissTutorial } from "./helpers";

const PUBLIC_INFO_PAGES = [
  { path: "/terms", heading: "利用規約" },
  { path: "/privacy", heading: "プライバシー" },
  { path: "/contact", heading: "お問い合わせ" },
] as const;

test("links the public information pages from home", async ({ page }) => {
  await page.goto("/");
  await dismissTutorial(page);

  const termsLink = page.getByRole("link", { name: "利用規約" });
  const privacyLink = page.getByRole("link", { name: "プライバシー" });
  const contactLink = page.getByRole("link", { name: "お問い合わせ" });

  await expect(termsLink).toBeVisible();
  await expect(privacyLink).toBeVisible();
  await expect(contactLink).toBeVisible();
  await expect(termsLink).toHaveAttribute("href", "/terms");
  await expect(privacyLink).toHaveAttribute("href", "/privacy");
  await expect(contactLink).toHaveAttribute("href", "/contact");

  await termsLink.focus();
  await expect(termsLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "利用規約", level: 1 })).toBeVisible();
});

test("serves every public information page with a route back to the game", async ({ page }) => {
  for (const infoPage of PUBLIC_INFO_PAGES) {
    await page.goto(infoPage.path);
    await expect(page.getByRole("heading", { name: infoPage.heading, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "ゲームに戻る" })).toHaveAttribute("href", "/");
  }
});

test("keeps public information pages readable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });

  for (const infoPage of PUBLIC_INFO_PAGES) {
    await page.goto(infoPage.path);
    await expect(page.getByRole("heading", { name: infoPage.heading, level: 1 })).toBeVisible();

    const metrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      legalScrollHeight: document.querySelector<HTMLElement>(".legalScroll")?.scrollHeight ?? 0,
      legalClientHeight: document.querySelector<HTMLElement>(".legalScroll")?.clientHeight ?? 0,
    }));

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.legalScrollHeight).toBeGreaterThan(metrics.legalClientHeight);
  }
});
