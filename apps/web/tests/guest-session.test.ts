import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuestSession } from "../lib/guest-session";

describe("guest session identifiers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses cryptographic random values when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xab);
      return bytes;
    });

    vi.stubGlobal("crypto", { getRandomValues });

    const session = createGuestSession();

    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(session.guestId).toBe("guest_" + "ab".repeat(16));
    expect(session.sessionId).toBe("session_" + "ab".repeat(16));
  });
});
