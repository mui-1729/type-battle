import { expect, test } from "@playwright/test";
import { selectPracticeMode, setNickname } from "./helpers";

test("diagnoses WebKit prompt geometry after a simulated software keyboard", async ({ browserName, page }) => {
  test.skip(browserName !== "webkit", "WebKit diagnostic only.");

  await page.addInitScript(() => {
    const viewport = new EventTarget() as EventTarget & { height: number; offsetTop: number };
    viewport.height = window.innerHeight;
    viewport.offsetTop = 0;
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
  await setNickname(page, "ViewportDiagnostic");
  await selectPracticeMode(page);
  await page.getByRole("button", { name: "練習を開始" }).click();
  await expect(page.locator(".status-playing")).toBeVisible({ timeout: 7_000 });
  await page.locator(".promptBox").click();
  await expect(page.getByLabel("入力欄")).toBeFocused();

  await page.evaluate(() => {
    (window as typeof window & { simulateSoftwareKeyboard: (height: number) => void }).simulateSoftwareKeyboard(500);
  });
  await expect(page.locator(".appShell")).toHaveClass(/hasConstrainedViewport/);
  await expect.poll(() => page.locator(".appShell").evaluate((element) => element.clientHeight)).toBe(500);

  for (const waitMs of [0, 100, 500, 2000, 5000]) {
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }
    const metrics = await page.locator(".matchSurface").evaluate((surface, waitMs) => {
      const prompt = surface.querySelector<HTMLElement>(".promptBox");
      const shell = document.querySelector<HTMLElement>(".appShell");
      const promptRect = prompt?.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return {
        waitMs,
        windowInnerHeight: window.innerHeight,
        visualViewportHeight: window.visualViewport?.height ?? null,
        visualViewportOffsetTop: window.visualViewport?.offsetTop ?? null,
        shellClientHeight: shell?.clientHeight ?? null,
        surfaceTop: surfaceRect.top,
        surfaceBottom: surfaceRect.bottom,
        surfaceClientHeight: surface.clientHeight,
        surfaceScrollHeight: surface.scrollHeight,
        surfaceScrollTop: surface.scrollTop,
        surfaceMaxScrollTop: Math.max(0, surface.scrollHeight - surface.clientHeight),
        surfaceOverflowY: getComputedStyle(surface).overflowY,
        promptTop: promptRect?.top ?? null,
        promptBottom: promptRect?.bottom ?? null,
        promptHeight: promptRect?.height ?? null
      };
    }, waitMs);
    console.log("IOS_VIEWPORT_DIAGNOSTIC", JSON.stringify(metrics));
  }
});
