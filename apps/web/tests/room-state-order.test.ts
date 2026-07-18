import { describe, expect, it } from "vitest";
import type { MatchResult, RoomState } from "@type-battle/shared";
import { resolveRoomSnapshot, shouldApplyRoomSnapshot } from "../app/_lib/room-state-order";

const result = { roomCode: "ABC123", players: [] } as unknown as MatchResult;
const finished = { roomCode: "ABC123", round: 1, status: "finished", result } as RoomState;

describe("shouldApplyRoomSnapshot", () => {
  it("ignores a late playing snapshot after terminal state", () => {
    const playing = { ...finished, status: "playing", result: undefined } as unknown as RoomState;
    expect(shouldApplyRoomSnapshot(finished, result, playing)).toBe(false);
  });

  it("allows a newer rematch round after terminal state", () => {
    const waiting = { ...finished, round: 2, status: "waiting", result: undefined } as unknown as RoomState;
    expect(shouldApplyRoomSnapshot(finished, result, waiting)).toBe(true);
  });

  it("preserves the result when a reconnect response contains stale same-round playing state", () => {
    const playing = { ...finished, status: "playing", result: undefined } as unknown as RoomState;

    expect(resolveRoomSnapshot(finished, result, playing)).toEqual({
      accepted: false,
      room: finished,
      result
    });
  });
});
