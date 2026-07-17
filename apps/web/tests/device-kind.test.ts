import { afterEach, describe, expect, it, vi } from "vitest";
import { detectDeviceKind } from "../app/_lib/device-kind";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("device kind", () => {
  it("does not treat a narrow desktop viewport as a mobile input device", () => {
    vi.stubGlobal("window", {
      innerWidth: 320,
      matchMedia: vi.fn(() => ({ matches: true })),
      navigator: { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }
    });

    expect(detectDeviceKind()).toBe("desktop");
  });

  it("keeps mobile user agents on the kana input path", () => {
    vi.stubGlobal("window", {
      innerWidth: 1024,
      matchMedia: vi.fn(() => ({ matches: false })),
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }
    });

    expect(detectDeviceKind()).toBe("mobile");
  });
});
