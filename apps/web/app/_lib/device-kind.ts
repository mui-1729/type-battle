import type { DeviceKind } from "@type-battle/shared";

export function detectDeviceKind(): DeviceKind {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const navigator = window.navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };

  if (navigator.userAgentData?.mobile) {
    return "mobile";
  }

  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    return "mobile";
  }

  return "desktop";
}
