import type { MatchResult, RoomState } from "@type-battle/shared";

export function shouldApplyRoomSnapshot(
  currentRoom: RoomState | null,
  currentResult: MatchResult | null,
  nextRoom: RoomState
): boolean {
  if (!currentRoom || currentRoom.roomCode !== nextRoom.roomCode) {
    return true;
  }

  const currentRound = currentRoom.round ?? 1;
  const nextRound = nextRoom.round ?? 1;

  if (nextRound > currentRound) {
    return true;
  }

  if (nextRound < currentRound) {
    return false;
  }

  const terminal = currentRoom.status === "finished" || currentRoom.result || currentResult;
  return !terminal || nextRoom.status === "finished" || Boolean(nextRoom.result);
}
