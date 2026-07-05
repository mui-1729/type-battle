import { describe, expect, it } from "vitest";
import { normalizeRoomCode, resolveRoomRoute } from "../src/room-routing.js";

describe("room routing", () => {
  it("normalizes room codes to uppercase", () => {
    expect(normalizeRoomCode(" ab12cd ")).toBe("AB12CD");
  });

  it("resolves websocket and state routes", () => {
    expect(resolveRoomRoute("/rooms/ab12cd/socket")).toEqual({
      action: "socket",
      roomCode: "AB12CD"
    });

    expect(resolveRoomRoute("/rooms/ab12cd/state")).toEqual({
      action: "state",
      roomCode: "AB12CD"
    });
  });

  it("rejects unrelated paths", () => {
    expect(resolveRoomRoute("/health")).toBeNull();
    expect(resolveRoomRoute("/rooms/ab12cd")).toBeNull();
  });
});
