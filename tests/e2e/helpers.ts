import { expect, type BrowserContext, type Page } from "@playwright/test";

type WebSocketProbeSnapshot = {
  socketCount: number;
  openSocketCount: number;
  closeEvents: Array<{ code: number; reason: string }>;
};

export async function installWebSocketProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const probe = {
      sockets: [] as WebSocket[],
      closeEvents: [] as Array<{ code: number; reason: string }>
    };

    Object.defineProperty(window, "__typeBattleE2EWebSocketProbe", {
      configurable: false,
      value: probe
    });
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args) as WebSocket;
        probe.sockets.push(socket);
        socket.addEventListener("close", (event) => {
          probe.closeEvents.push({ code: event.code, reason: event.reason });
        });
        return socket;
      }
    });
  });
}

export async function closeLatestOpenWebSocket(
  page: Page,
  code: number,
  reason: string
): Promise<WebSocketProbeSnapshot> {
  return page.evaluate(({ closeCode, closeReason }) => {
    const probe = (window as typeof window & {
      __typeBattleE2EWebSocketProbe?: {
        sockets: WebSocket[];
        closeEvents: Array<{ code: number; reason: string }>;
      };
    }).__typeBattleE2EWebSocketProbe;
    if (!probe) {
      throw new Error("The E2E WebSocket probe is not installed.");
    }
    const socket = probe.sockets.findLast((candidate) => candidate.readyState === WebSocket.OPEN);
    if (!socket) {
      throw new Error("No open WebSocket was captured by the E2E probe.");
    }

    socket.close(closeCode, closeReason);
    return {
      socketCount: probe.sockets.length,
      openSocketCount: probe.sockets.filter((candidate) => candidate.readyState === WebSocket.OPEN).length,
      closeEvents: probe.closeEvents.map((event) => ({ ...event }))
    };
  }, { closeCode: code, closeReason: reason });
}

export async function readWebSocketProbe(page: Page): Promise<WebSocketProbeSnapshot> {
  return page.evaluate(() => {
    const probe = (window as typeof window & {
      __typeBattleE2EWebSocketProbe?: {
        sockets: WebSocket[];
        closeEvents: Array<{ code: number; reason: string }>;
      };
    }).__typeBattleE2EWebSocketProbe;
    if (!probe) {
      throw new Error("The E2E WebSocket probe is not installed.");
    }
    return {
      socketCount: probe.sockets.length,
      openSocketCount: probe.sockets.filter((socket) => socket.readyState === WebSocket.OPEN).length,
      closeEvents: probe.closeEvents.map((event) => ({ ...event }))
    };
  });
}

export async function expectFixedViewport(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".appShell");
    const isVisible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity) > 0.05 &&
        rect.width > 0 &&
        rect.height > 0;
    };
    const isOutsideViewport = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth;
    };
    const outsideControls = Array.from(document.querySelectorAll<HTMLElement>(".appShell button, .appShell a, .appShell input, .appShell select"))
      .filter((element) => isVisible(element) && getComputedStyle(element).pointerEvents !== "none")
      .filter(isOutsideViewport)
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? element.tagName);
    const outsideContentRegions = Array.from(document.querySelectorAll<HTMLElement>(
      ".feedbackCard, .howToPlayCard, .soloModePicker, .dailyChallengePanel, .difficultySelector, .mistakeTrendPanel, .battleStage, .practiceStage, .promptBox, .resultPanel"
    ))
      .filter(isVisible)
      .filter(isOutsideViewport)
      .map((element) => element.className);

    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      shellScrollTop: shell?.scrollTop ?? 0,
      shellScrollLeft: shell?.scrollLeft ?? 0,
      outsideControls,
      outsideContentRegions
    };
  });

  expect(metrics.documentHeight).toBe(metrics.viewportHeight);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.shellScrollTop).toBe(0);
  expect(metrics.shellScrollLeft).toBe(0);
  expect(metrics.outsideControls).toEqual([]);
  expect(metrics.outsideContentRegions).toEqual([]);
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
