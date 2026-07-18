export type DesktopTypingKeyDecision = {
  roomPlaying: boolean;
  practiceActive: boolean;
  acceptingTextInput: boolean;
  roomFinishPending: boolean;
  exitRequested: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  keyCode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  editableTarget: boolean;
  key: string;
};

export function shouldHandleDesktopTypingKey({
  roomPlaying,
  practiceActive,
  acceptingTextInput,
  roomFinishPending,
  exitRequested,
  defaultPrevented,
  isComposing,
  keyCode,
  ctrlKey,
  metaKey,
  altKey,
  editableTarget,
  key
}: DesktopTypingKeyDecision): boolean {
  if (!roomPlaying && !practiceActive) {
    return false;
  }

  if (!acceptingTextInput || exitRequested || (roomPlaying && roomFinishPending)) {
    return false;
  }

  return !(
    defaultPrevented ||
    isComposing ||
    keyCode === 229 ||
    ctrlKey ||
    metaKey ||
    altKey ||
    editableTarget ||
    key.length !== 1
  );
}
