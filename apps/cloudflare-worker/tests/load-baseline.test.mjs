/* global AbortController, Buffer, URL, queueMicrotask */

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  aggregateFailures,
  createRoomCode,
  createSummary,
  hasAuthoritativeProgress,
  isBothPlayersReady,
  LoadBaselineError,
  parseTargetUrl,
  readBoundedInteger,
  readConfiguration,
  RealtimeClient,
  summarizeLatency,
} from "../scripts/load-baseline-lib.mjs";

function captureError(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw.");
}

class FakeWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    super();
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState !== FakeWebSocket.CONNECTING) return;
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open");
    });
  }

  send(value) {
    this.sent.push(value);
  }

  close(code = 1000, reason = "closed") {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", code, Buffer.from(reason));
  }
}

describe("load baseline configuration", () => {
  it("requires an explicit target and deliberate confirmation", () => {
    expect(captureError(() => readConfiguration({}))).toMatchObject({
      stage: "configuration",
      code: "TARGET_REQUIRED",
    });

    expect(captureError(() => readConfiguration({
      CLOUDFLARE_WORKER_URL: "http://127.0.0.1:8787",
    }))).toMatchObject({
      stage: "configuration",
      code: "CONFIRMATION_REQUIRED",
    });
  });

  it("accepts IPv4, localhost, and documented bracketed IPv6 loopback", () => {
    expect(parseTargetUrl("http://localhost:8787/path").origin).toBe("http://localhost:8787");
    expect(parseTargetUrl("http://127.0.0.1:8787").origin).toBe("http://127.0.0.1:8787");
    expect(parseTargetUrl("http://[::1]:8787").origin).toBe("http://[::1]:8787");
  });

  it("requires remote workers.dev targets to use standard HTTPS without credentials", () => {
    expect(parseTargetUrl("https://owned-worker.example.workers.dev/path?ignored=1").href)
      .toBe("https://owned-worker.example.workers.dev/");

    for (const [url, code] of [
      ["http://owned-worker.example.workers.dev", "WORKERS_DEV_HTTPS_REQUIRED"],
      ["https://owned-worker.example.workers.dev:8443", "WORKERS_DEV_PORT_NOT_ALLOWED"],
      ["https://workers.dev.evil.example", "TARGET_NOT_ALLOWED"],
      ["https://evilworkers.dev", "TARGET_NOT_ALLOWED"],
      ["https://user:password@owned-worker.example.workers.dev", "TARGET_CREDENTIALS_NOT_ALLOWED"],
    ]) {
      expect(captureError(() => parseTargetUrl(url))).toMatchObject({ code });
    }
  });

  it("rejects fractional, non-numeric, and out-of-cap room counts", () => {
    expect(readBoundedInteger(undefined, 5, 1, 20, "LOAD_ROOMS")).toBe(5);
    expect(readBoundedInteger("20", 5, 1, 20, "LOAD_ROOMS")).toBe(20);
    for (const value of ["0", "21", "1.5", "NaN", "Infinity"]) {
      expect(captureError(() => readBoundedInteger(value, 5, 1, 20, "LOAD_ROOMS")))
        .toBeInstanceOf(LoadBaselineError);
    }
  });
});

describe("load baseline observations", () => {
  it("reports setup and whole-scenario latency separately", () => {
    expect(summarizeLatency([40, 10, 30, 20])).toEqual({ min: 10, p50: 20, p95: 40, max: 40 });

    const summary = createSummary({
      target: new URL("http://127.0.0.1:8787"),
      startedAt: new Date("2026-08-22T00:00:00.000Z"),
      finishedAt: new Date("2026-08-22T00:00:10.000Z"),
      rooms: [
        { index: 1, roomCode: "AAAAAA", ok: true, setupLatencyMs: 25, scenarioLatencyMs: 3_100 },
        { index: 2, roomCode: "BBBBBB", ok: true, setupLatencyMs: 40, scenarioLatencyMs: 3_250 },
      ],
    });

    expect(summary.latencyMs).toEqual({
      setup: { min: 25, p50: 25, p95: 40, max: 40 },
      scenario: { min: 3_100, p50: 3_100, p95: 3_250, max: 3_250 },
    });
    expect(summary.webSocketsPlanned).toBe(4);
    expect(summary.webSocketSafetyCap).toBe(40);
  });

  it("aggregates failures by stable stage and code instead of room labels", () => {
    expect(aggregateFailures([
      { stage: "socket_open", code: "SOCKET_CLOSED", message: "host-1 closed" },
      { stage: "socket_open", code: "SOCKET_CLOSED", message: "guest-8 closed" },
      { stage: "room_join", code: "ACK_REJECTED", message: "guest-2 rejected" },
    ])).toEqual([
      { stage: "room_join", code: "ACK_REJECTED", count: 1 },
      { stage: "socket_open", code: "SOCKET_CLOSED", count: 2 },
    ]);
  });

  it("requires authoritative progress from both exact player IDs", () => {
    const state = (players) => ({ type: "server:room:state", payload: { players } });
    expect(hasAuthoritativeProgress(state([
      { id: "host", progressIndex: 1 },
      { id: "guest", progressIndex: 0 },
    ]), ["host", "guest"])).toBe(false);
    expect(hasAuthoritativeProgress(state([
      { id: "host", progressIndex: 1 },
      { id: "guest", typingProgressIndex: 1 },
    ]), ["host", "guest"])).toBe(true);
    expect(hasAuthoritativeProgress(state([
      { id: "host", progressIndex: 1 },
      { id: "other", progressIndex: 1 },
    ]), ["host", "guest"])).toBe(false);
  });

  it("recognizes ready state only when exactly two players are ready", () => {
    expect(isBothPlayersReady({
      type: "server:room:state",
      payload: { players: [{ ready: true }, { ready: true }] },
    })).toBe(true);
    expect(isBothPlayersReady({
      type: "server:room:state",
      payload: { players: [{ ready: true }, { ready: false }] },
    })).toBe(false);
  });

  it("creates bounded room codes from the non-ambiguous alphabet", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(createRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/u);
    }
  });
});

describe("RealtimeClient lifecycle", () => {
  it("rejects pending waiters immediately when an opened socket closes", async () => {
    FakeWebSocket.instances = [];
    const controller = new AbortController();
    const client = new RealtimeClient({
      roomCode: "ABC123",
      label: "host-1",
      workerUrl: new URL("http://127.0.0.1:8787"),
      signal: controller.signal,
      WebSocketImpl: FakeWebSocket,
    });

    await client.open();
    const waiter = client.waitFor(() => false);
    FakeWebSocket.instances[0].close(1006, "network");

    await expect(waiter).rejects.toMatchObject({ code: "SOCKET_CLOSED" });
  });

  it("rejects pending waiters immediately when the scenario deadline aborts", async () => {
    FakeWebSocket.instances = [];
    const controller = new AbortController();
    const client = new RealtimeClient({
      roomCode: "ABC123",
      label: "guest-1",
      workerUrl: new URL("http://127.0.0.1:8787"),
      signal: controller.signal,
      WebSocketImpl: FakeWebSocket,
    });

    await client.open();
    const waiter = client.waitFor(() => false);
    controller.abort(new Error("deadline"));

    await expect(waiter).rejects.toMatchObject({ code: "SCENARIO_ABORTED" });
  });
});
