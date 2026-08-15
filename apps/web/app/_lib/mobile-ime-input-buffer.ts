import {
  updateMobileInputBuffer,
  type MobileInputBufferResult,
  type MobileInputBufferState,
  type MobileInputUpdate
} from "./mobile-input-buffer";

export function updateMobileImeInputBuffer(
  previous: MobileInputBufferState,
  update: MobileInputUpdate
): MobileInputBufferResult {
  if (!update.composing || update.commit || !update.value) {
    return updateMobileInputBuffer(previous, update);
  }

  const characters = Array.from(update.value);
  const stableValue = characters.slice(0, -1).join("");

  return updateMobileInputBuffer(previous, {
    ...update,
    value: stableValue
  });
}
