export type SocketMode = "practice" | "room" | null;

export function getPracticeSocketToRelease<T>(socket: T | null, mode: SocketMode): T | null {
  return socket && mode === "practice" ? socket : null;
}
