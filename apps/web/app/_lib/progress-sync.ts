export type ProgressSyncState = "synced" | "pending" | "delayed" | "offline";

type ProgressSyncInput = {
  connected: boolean;
  localTypedCharacters: number;
  serverTypedCharacters: number;
  lastSentAt: number | null;
  now: number;
  delayThresholdMs?: number;
};

export function getProgressSyncState({
  connected,
  localTypedCharacters,
  serverTypedCharacters,
  lastSentAt,
  now,
  delayThresholdMs = 1_500
}: ProgressSyncInput): ProgressSyncState {
  if (!connected) {
    return "offline";
  }

  if (serverTypedCharacters >= localTypedCharacters) {
    return "synced";
  }

  if (lastSentAt !== null && now - lastSentAt >= delayThresholdMs) {
    return "delayed";
  }

  return "pending";
}

export function getProgressSyncLabel(state: ProgressSyncState): string {
  switch (state) {
    case "offline":
      return "再接続中: 入力を一時停止しています";
    case "delayed":
      return "進捗同期が遅れています";
    case "pending":
      return "進捗を同期中";
    case "synced":
      return "進捗は同期済み";
  }
}
