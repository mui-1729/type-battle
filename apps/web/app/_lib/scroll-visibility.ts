export type ScrollVisibilityInput = {
  scrollTop: number;
  containerTop: number;
  containerBottom: number;
  targetTop: number;
  targetBottom: number;
  padding?: number;
};

export function getScrollTopToRevealTarget({
  scrollTop,
  containerTop,
  containerBottom,
  targetTop,
  targetBottom,
  padding = 12
}: ScrollVisibilityInput): number {
  const visualViewport = typeof window === "undefined" ? null : window.visualViewport;
  const visualViewportBottom = visualViewport
    ? visualViewport.offsetTop + visualViewport.height
    : containerBottom;
  const visibleTop = containerTop + padding;
  const visibleBottom = Math.min(containerBottom, visualViewportBottom) - padding;

  if (targetBottom > visibleBottom) {
    // A minimal delta can be clamped by the scroll container when the keyboard
    // removes a large part of the viewport. Align the prompt with the top of
    // the remaining visible surface so the whole prompt can stay above it.
    return Math.max(0, scrollTop + targetTop - visibleTop);
  }

  if (targetTop < visibleTop) {
    return Math.max(0, scrollTop - (visibleTop - targetTop));
  }

  return Math.max(0, scrollTop);
}
