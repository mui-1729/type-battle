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

  if (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768) {
    return "mobile";
  }

  return "desktop";
}

