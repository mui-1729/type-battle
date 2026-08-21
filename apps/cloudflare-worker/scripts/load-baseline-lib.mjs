/* global AbortSignal, URL, crypto, performance, process */

import WebSocket from "ws";

export const LOAD_CONFIRMATION = "I_OWN_THIS_TARGET";
export const DEFAULT_ROOMS = 5;
export const MAX_ROOMS = 20;
export const MAX_WEBSOCKETS = MAX_ROOMS * 2;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const MAX_TIMEOUT_MS = 60_000;

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class LoadBaselineError extends Error {
  constructor(stage, code, message, options) {
    super(message, options);
    this.name = "LoadBaselineError";
    this.stage = stage;
    this.code = code;
  }
}

class ClientLifecycleError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "ClientLifecycleError";
    this.code = code;
  }
}

export function readConfiguration(env = process.env) {
  const workerUrl = parseTargetUrl(env.CLOUDFLARE_WORKER_URL);

  if (env.TYPE_BATTLE_LOAD_CONFIRM !== LOAD_CONFIRMATION) {
    throw new LoadBaselineError(
      "configuration",
      "CONFIRMATION_REQUIRED",
      `Refusing to run. Set TYPE_BATTLE_LOAD_CONFIRM=${LOAD_CONFIRMATION} as a deliberate acknowledgement that the target is authorized. This acknowledgement does not prove ownership.`,
    );
  }

  return {
    workerUrl,
    roomsRequested: readBoundedInteger(env.LOAD_ROOMS, DEFAULT_ROOMS, 1, MAX_ROOMS, "LOAD_ROOMS"),
    timeoutMs: readBoundedInteger(
      env.LOAD_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      5_000,
      MAX_TIMEOUT_MS,
      "LOAD_TIMEOUT_MS",
    ),
    outputPath: env.LOAD_OUTPUT?.trim() || null,
  };
}

export function parseTargetUrl(raw) {
  if (!raw?.trim()) {
    throw new LoadBaselineError("configuration", "TARGET_REQUIRED", "CLOUDFLARE_WORKER_URL is required.");
  }

  let url;
  try {
    url = new URL(raw.trim());
  } catch (error) {
    throw new LoadBaselineError(
      "configuration",
      "TARGET_INVALID_URL",
      "CLOUDFLARE_WORKER_URL must be a valid URL.",
      { cause: error },
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LoadBaselineError(
      "configuration",
      "TARGET_INVALID_PROTOCOL",
      "CLOUDFLARE_WORKER_URL must use http or https.",
    );
  }
  if (url.username || url.password) {
    throw new LoadBaselineError(
      "configuration",
      "TARGET_CREDENTIALS_NOT_ALLOWED",
      "CLOUDFLARE_WORKER_URL must not include URL credentials.",
    );
  }

  assertAllowedTarget(url);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function assertAllowedTarget(url) {
  const hostname = normalizeHostname(url.hostname);
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (isLoopback) {
    return;
  }

  if (!hostname.endsWith(".workers.dev")) {
    throw new LoadBaselineError(
      "configuration",
      "TARGET_NOT_ALLOWED",
      "Refusing target. Load baseline is limited to loopback or an authorized *.workers.dev Worker.",
    );
  }
  if (url.protocol !== "https:") {
    throw new LoadBaselineError(
      "configuration",
      "WORKERS_DEV_HTTPS_REQUIRED",
      "Remote *.workers.dev targets must use HTTPS (and therefore WSS).",
    );
  }
  if (url.port !== "") {
    throw new LoadBaselineError(
      "configuration",
      "WORKERS_DEV_PORT_NOT_ALLOWED",
      "Remote *.workers.dev targets must use the standard HTTPS port without an explicit nonstandard port.",
    );
  }
}

export function readBoundedInteger(raw, fallback, min, max, name) {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new LoadBaselineError(
      "configuration",
      "INTEGER_OUT_OF_RANGE",
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }
  return value;
}

export function createRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

export function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  );
  return sortedValues[index];
}

export function summarizeLatency(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1),
  };
}

export function aggregateFailures(failures) {
  const counts = new Map();
  for (const failure of failures) {
    const key = `${failure.stage}\0${failure.code}`;
    const current = counts.get(key);
    counts.set(key, current ? { ...current, count: current.count + 1 } : {
      stage: failure.stage,
      code: failure.code,
      count: 1,
    });
  }
  return [...counts.values()].sort((left, right) =>
    left.stage.localeCompare(right.stage) || left.code.localeCompare(right.code),
  );
}

export function createSummary({ target, startedAt, finishedAt, rooms }) {
  const successes = rooms.filter((room) => room.ok);
  const failures = rooms.filter((room) => !room.ok).map((room) => room.failure);
  return {
    target: target.origin,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    roomsRequested: rooms.length,
    roomsSucceeded: successes.length,
    roomsFailed: failures.length,
    webSocketsPlanned: rooms.length * 2,
    webSocketSafetyCap: MAX_WEBSOCKETS,
    latencyMs: {
      setup: summarizeLatency(successes.map((room) => room.setupLatencyMs)),
      scenario: summarizeLatency(successes.map((room) => room.scenarioLatencyMs)),
    },
    failureAggregation: aggregateFailures(failures),
    rooms,
  };
}

export async function executeRoomScenario(options) {
  const started = performance.now();
  try {
    return await runRoomScenario({ ...options, scenarioStarted: started });
  } catch (error) {
    return {
      index: options.index,
      roomCode: options.roomCode,
      ok: false,
      scenarioLatencyMs: Math.round(performance.now() - started),
      failure: normalizeFailure(error),
    };
  }
}

export async function runRoomScenario({
  index,
  roomCode,
  workerUrl,
  timeoutMs,
  WebSocketImpl = WebSocket,
  scenarioStarted = performance.now(),
}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const host = new RealtimeClient({
    roomCode,
    label: `host-${index}`,
    workerUrl,
    signal,
    WebSocketImpl,
  });
  const guest = new RealtimeClient({
    roomCode,
    label: `guest-${index}`,
    workerUrl,
    signal,
    WebSocketImpl,
  });
  let setupLatencyMs;

  try {
    await atStage("socket_open", "SOCKET_OPEN_FAILED", signal, () => Promise.all([host.open(), guest.open()]));

    const hostCreateAck = await atStage("room_create", "ROOM_CREATE_FAILED", signal, () =>
      host.command("client:room:create", {
        roomCode,
        nickname: `LoadHost${index}`,
        guestId: `load_host_${crypto.randomUUID().replaceAll("-", "")}`,
        sessionId: crypto.randomUUID(),
        deviceKind: "desktop",
      }),
    );
    assertAckOk(hostCreateAck, "room create");

    const guestJoinAck = await atStage("room_join", "ROOM_JOIN_FAILED", signal, () =>
      guest.command("client:room:join", {
        roomCode,
        nickname: `LoadGuest${index}`,
        guestId: `load_guest_${crypto.randomUUID().replaceAll("-", "")}`,
        sessionId: crypto.randomUUID(),
        deviceKind: "desktop",
      }),
    );
    assertAckOk(guestJoinAck, "room join");

    const hostPlayerId = hostCreateAck.payload?.data?.playerId;
    const guestPlayerId = guestJoinAck.payload?.data?.playerId;
    if (typeof hostPlayerId !== "string" || typeof guestPlayerId !== "string") {
      throw new LoadBaselineError(
        "room_join",
        "PLAYER_IDS_MISSING",
        "Room setup did not return both player IDs.",
      );
    }
    setupLatencyMs = Math.round(performance.now() - scenarioStarted);

    host.send("client:player:ready", { roomCode, ready: true });
    guest.send("client:player:ready", { roomCode, ready: true });
    await atStage("room_ready", "READY_STATE_NOT_OBSERVED", signal, () =>
      Promise.all([
        host.waitFor(isBothPlayersReady),
        guest.waitFor(isBothPlayersReady),
      ]),
    );

    const startAck = await atStage("match_start", "MATCH_START_FAILED", signal, () =>
      host.command("client:match:start", { roomCode }),
    );
    assertAckOk(startAck, "match start");

    const startedMessage = await atStage("match_started", "MATCH_STARTED_NOT_OBSERVED", signal, () =>
      host.waitFor((message) => message.type === "server:match:started"),
    );
    const typing = startedMessage.payload?.prompt?.typing?.romaji
      ?? startAck.payload?.data?.prompt?.typing?.romaji;
    if (typeof typing !== "string" || typing.length === 0) {
      throw new LoadBaselineError(
        "match_started",
        "PROMPT_MISSING",
        "Match started without a romaji prompt.",
      );
    }

    const input = Array.from(typing).slice(0, 4).join("");
    host.send("client:typing:progress", { roomCode, input, sequence: 1 });
    guest.send("client:typing:progress", { roomCode, input, sequence: 1 });

    const hasBothAuthoritativeProgress = (message) =>
      hasAuthoritativeProgress(message, [hostPlayerId, guestPlayerId]);
    await atStage("typing_progress", "AUTHORITATIVE_PROGRESS_NOT_OBSERVED", signal, () =>
      Promise.all([
        host.waitFor(hasBothAuthoritativeProgress),
        guest.waitFor(hasBothAuthoritativeProgress),
      ]),
    );

    return {
      index,
      roomCode,
      ok: true,
      setupLatencyMs,
      scenarioLatencyMs: Math.round(performance.now() - scenarioStarted),
    };
  } finally {
    host.leave();
    guest.leave();
    host.close();
    guest.close();
  }
}

export class RealtimeClient {
  constructor({ roomCode, label, workerUrl, signal, WebSocketImpl = WebSocket }) {
    this.roomCode = roomCode;
    this.label = label;
    this.workerUrl = workerUrl;
    this.signal = signal;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.inbox = [];
    this.waiters = [];
    this.terminalError = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      if (this.signal.aborted) {
        reject(this.createAbortError());
        return;
      }

      const wsUrl = new URL(`/rooms/${this.roomCode}/socket`, this.workerUrl);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      const socket = new this.WebSocketImpl(wsUrl);
      this.socket = socket;
      let openSettled = false;

      const settleOpen = (operation) => {
        if (openSettled) return;
        openSettled = true;
        this.signal.removeEventListener("abort", onAbort);
        operation();
      };
      const onAbort = () => {
        const error = this.createAbortError();
        this.failPending(error);
        if (socket.readyState <= this.WebSocketImpl.OPEN) socket.close();
        settleOpen(() => reject(error));
      };

      this.signal.addEventListener("abort", onAbort, { once: true });
      socket.once("open", () => settleOpen(resolve));
      socket.on("message", (raw) => this.onMessage(raw));
      socket.on("error", (error) => {
        const failure = new ClientLifecycleError(
          "SOCKET_ERROR",
          `${this.label}: WebSocket error: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
        this.terminalError = failure;
        this.failPending(failure);
        settleOpen(() => reject(failure));
      });
      socket.on("close", (code, reason) => {
        const detail = reason?.toString() || "no reason";
        const failure = this.terminalError ?? new ClientLifecycleError(
          "SOCKET_CLOSED",
          `${this.label}: WebSocket closed (${code}, ${detail}).`,
        );
        this.terminalError = failure;
        this.failPending(failure);
        settleOpen(() => reject(failure));
      });
    });
  }

  send(type, payload) {
    if (!this.socket || this.socket.readyState !== this.WebSocketImpl.OPEN) {
      throw this.terminalError ?? new ClientLifecycleError(
        "SOCKET_NOT_OPEN",
        `${this.label}: WebSocket is not open.`,
      );
    }

    try {
      this.socket.send(JSON.stringify({ id: crypto.randomUUID(), type, payload }));
    } catch (error) {
      throw new ClientLifecycleError(
        "SOCKET_SEND_FAILED",
        `${this.label}: WebSocket send failed.`,
        { cause: error },
      );
    }
  }

  command(type, payload) {
    if (!this.socket || this.socket.readyState !== this.WebSocketImpl.OPEN) {
      return Promise.reject(this.terminalError ?? new ClientLifecycleError(
        "SOCKET_NOT_OPEN",
        `${this.label}: WebSocket is not open.`,
      ));
    }

    const id = crypto.randomUUID();
    this.socket.send(JSON.stringify({ id, type, payload }));
    return this.waitFor((message) => message.type === "server:ack" && message.replyTo === id);
  }

  waitFor(predicate) {
    if (this.terminalError) return Promise.reject(this.terminalError);
    if (this.signal.aborted) return Promise.reject(this.createAbortError());

    const existingIndex = this.inbox.findIndex(predicate);
    if (existingIndex >= 0) {
      const [message] = this.inbox.splice(existingIndex, 1);
      return Promise.resolve(message);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        onAbort: () => {
          this.removeWaiter(waiter);
          reject(this.createAbortError());
        },
      };
      this.signal.addEventListener("abort", waiter.onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    for (const waiter of [...this.waiters]) {
      let matches = false;
      try {
        matches = waiter.predicate(message);
      } catch (error) {
        this.removeWaiter(waiter);
        waiter.reject(error);
        continue;
      }
      if (!matches) continue;

      this.removeWaiter(waiter);
      waiter.resolve(message);
      return;
    }

    this.inbox.push(message);
    if (this.inbox.length > 100) this.inbox.shift();
  }

  leave() {
    if (!this.socket || this.socket.readyState !== this.WebSocketImpl.OPEN) return;
    try {
      this.send("client:room:leave", { roomCode: this.roomCode });
    } catch {
      // Cleanup is best effort and must not hide the scenario result.
    }
  }

  close() {
    this.failPending(new ClientLifecycleError("SOCKET_CLOSED", `${this.label}: WebSocket closed by client.`));
    if (this.socket && this.socket.readyState <= this.WebSocketImpl.OPEN) {
      this.socket.close();
    }
  }

  failPending(error) {
    for (const waiter of [...this.waiters]) {
      this.removeWaiter(waiter);
      waiter.reject(error);
    }
  }

  removeWaiter(waiter) {
    this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
    this.signal.removeEventListener("abort", waiter.onAbort);
  }

  createAbortError() {
    return new ClientLifecycleError(
      "SCENARIO_ABORTED",
      `${this.label}: Scenario deadline was reached.`,
      { cause: this.signal.reason },
    );
  }
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

export function isBothPlayersReady(message) {
  if (message.type !== "server:room:state") return false;
  const players = message.payload?.players;
  return Array.isArray(players) && players.length === 2 && players.every((player) => player.ready === true);
}

export function hasAuthoritativeProgress(message, playerIds) {
  if (message.type !== "server:room:state") return false;
  const players = message.payload?.players;
  if (!Array.isArray(players)) return false;
  return playerIds.every((playerId) => players.some((player) =>
    player.id === playerId && Math.max(player.progressIndex ?? 0, player.typingProgressIndex ?? 0) > 0,
  ));
}

async function atStage(stage, fallbackCode, signal, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LoadBaselineError) throw error;
    if (signal.aborted) {
      throw new LoadBaselineError(
        stage,
        "SCENARIO_DEADLINE_EXCEEDED",
        `Scenario deadline exceeded during ${stage}.`,
        { cause: error },
      );
    }
    if (error instanceof ClientLifecycleError) {
      throw new LoadBaselineError(stage, error.code, error.message, { cause: error });
    }
    throw new LoadBaselineError(
      stage,
      fallbackCode,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

function assertAckOk(message, operation) {
  if (!message?.payload?.ok) {
    throw new ClientLifecycleError(
      "ACK_REJECTED",
      `${operation} failed: ${message?.payload?.error ?? "unknown error"}`,
    );
  }
}

function normalizeFailure(error) {
  if (error instanceof LoadBaselineError) {
    return { stage: error.stage, code: error.code, message: error.message };
  }
  return {
    stage: "unknown",
    code: "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}
