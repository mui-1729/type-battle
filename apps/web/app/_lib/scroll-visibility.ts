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
    return Math.max(0, scrollTop + targetBottom - visibleBottom);
  }

  if (targetTop < visibleTop) {
    return Math.max(0, scrollTop - (visibleTop - targetTop));
  }

  return Math.max(0, scrollTop);
}
