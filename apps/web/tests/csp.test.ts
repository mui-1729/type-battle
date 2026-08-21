import { describe, expect, it } from "vitest";
import {
  buildConnectSources,
  buildContentSecurityPolicy,
  getRealtimeOrigin
} from "../csp";

describe("Content Security Policy", () => {
  it("allows only self and the configured realtime origin in production", () => {
    expect(buildConnectSources({
      isDevelopment: false,
      realtimeUrl: "wss://realtime.example.workers.dev/socket?token=ignored"
    })).toEqual(["'self'", "wss://realtime.example.workers.dev"]);
  });

  it("does not add generic production network schemes", () => {
    const policy = buildContentSecurityPolicy({
      isDevelopment: false,
      realtimeUrl: "wss://realtime.example.workers.dev/socket"
    });

    expect(policy).toContain("connect-src 'self' wss://realtime.example.workers.dev;");
    expect(policy).not.toContain("connect-src 'self' https:");
    expect(policy).not.toContain(" wss: ws:");
  });

  it("uses the deployment-specific preview endpoint without allowing production globally", () => {
    expect(buildConnectSources({
      isDevelopment: false,
      realtimeUrl: "wss://preview-realtime.example.workers.dev"
    })).toEqual(["'self'", "wss://preview-realtime.example.workers.dev"]);
  });

  it("falls back to self only when realtime is not configured", () => {
    expect(buildConnectSources({ isDevelopment: false, realtimeUrl: "" }))
      .toEqual(["'self'"]);
  });

  it("keeps broad schemes only in development for HMR and local workers", () => {
    expect(buildConnectSources({
      isDevelopment: true,
      realtimeUrl: "ws://127.0.0.1:8787"
    })).toEqual(["'self'", "http:", "https:", "ws:", "wss:"]);
  });

  it("normalizes a realtime URL to its exact origin", () => {
    expect(getRealtimeOrigin("  wss://worker.example.com:443/realtime/path  "))
      .toBe("wss://worker.example.com");
    expect(getRealtimeOrigin("javascript:alert(1)")).toBeNull();
    expect(getRealtimeOrigin("not a url")).toBeNull();
  });
});
