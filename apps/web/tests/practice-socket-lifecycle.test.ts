import { describe, expect, it } from "vitest";
import { getPracticeSocketToRelease } from "../app/_lib/practice-socket-lifecycle";

describe("practice socket lifecycle", () => {
  it("releases a practice socket when local practice no longer needs it", () => {
    const socket = { id: "practice" };

    expect(getPracticeSocketToRelease(socket, "practice")).toBe(socket);
  });

  it("never selects a room socket for practice cleanup", () => {
    const socket = { id: "room" };

    expect(getPracticeSocketToRelease(socket, "room")).toBeNull();
    expect(getPracticeSocketToRelease(socket, null)).toBeNull();
    expect(getPracticeSocketToRelease(null, "practice")).toBeNull();
  });
});
