import { describe, expect, it } from "vitest";
import { startDailyPractice, startPractice } from "../src/practice.js";

describe("practice session factory", () => {
  it("creates a categorized practice prompt with a stable session shape", () => {
    const session = startPractice("Alice", "short");

    expect(session.practiceId).toMatch(/^[A-Z0-9]{6}$/);
    expect(session.prompt.category).toBe("short");
    expect(session.startedAt).toBeGreaterThan(0);
  });

  it("creates a daily practice session with the current challenge key", () => {
    const session = startDailyPractice("Alice");

    expect(session.practiceId).toMatch(/^[A-Z0-9]{6}$/);
    expect(session.challengeKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(session.prompt.category).toBe("standard");
  });
});
