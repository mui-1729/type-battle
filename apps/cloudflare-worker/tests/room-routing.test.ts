import { describe, expect, it } from "vitest";
import { normalizeRoomCode, resolveRoomRoute } from "../src/room-routing.js";

describe("room routing", () => {
  it("normalizes room codes to uppercase", () => {
    expect(normalizeRoomCode(" ab23cd ")).toBe("AB23CD");
  });

  it("resolves websocket and state routes", () => {
    expect(resolveRoomRoute("/rooms/ab23cd/socket")).toEqual({
      action: "socket",
      roomCode: "AB23CD"
    });

    expect(resolveRoomRoute("/rooms/ab23cd/state")).toEqual({
      action: "state",
      roomCode: "AB23CD"
    });
  });

  it("rejects invalid room codes", () => {
    expect(resolveRoomRoute("/rooms/ab12cd/socket")).toBeNull();
    expect(resolveRoomRoute("/rooms/toolong1/socket")).toBeNull();
    expect(resolveRoomRoute("/rooms/ab_cd_/state")).toBeNull();
  });

  it("rejects unrelated paths", () => {
    expect(resolveRoomRoute("/health")).toBeNull();
    expect(resolveRoomRoute("/rooms/ab23cd")).toBeNull();
  });
});
