import { writeFile } from "node:fs/promises";
import WebSocket from "ws";

const CONFIRMATION = "I_OWN_THIS_TARGET";
const DEFAULT_ROOMS = 5;
const MAX_ROOMS = 20;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 60_000;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const workerUrl = readTargetUrl();
const roomsRequested = readBoundedInteger("LOAD_ROOMS", DEFAULT_ROOMS, 1, MAX_ROOMS);
const timeoutMs = readBoundedInteger("LOAD_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 5_000, MAX_TIMEOUT_MS);
const outputPath = process.env.LOAD_OUTPUT?.trim() || null;

if (process.env.TYPE_BATTLE_LOAD_CONFIRM !== CONFIRMATION) {
  fail(
    `Refusing to run. Set TYPE_BATTLE_LOAD_CONFIRM=${CONFIRMATION} only for a target you are authorized to test.`,
  );
}

assertAllowedTarget(workerUrl);

const startedAt = new Date();
console.log(
  `Running bounded load baseline against ${workerUrl.origin}: ${roomsRequested} rooms / ${roomsRequested * 2} sockets max`,
);

const scenarios = await Promise.allSettled(
  Array.from({ length: roomsRequested }, (_, index) => runRoomScenario(index + 1)),
);

const successes = scenarios
  .filter((result) => result.status === "fulfilled")
  .map((result) => result.value);
const failures = scenarios
  .filter((result) => result.status === "rejected")
  .map((result) => normalizeFailure(result.reason));
const latencies = successes.map((result) => result.setupLatencyMs).sort((a, b) => a - b);
const failureReasons = Object.fromEntries(
  [...new Set(failures.map((failure) => failure.message))].map((message) => [
    message,
    failures.filter((failure) => failure.message === message).length,
  ]),
);

const summary = {
  target: workerUrl.origin,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  roomsRequested,
  roomsSucceeded: successes.length,
  roomsFailed: failures.length,
  connectionsAttempted: roomsRequested * 2,
  setupLatencyMs: latencies.length
    ? {
        min: latencies[0],
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: latencies.at(-1),
      }
    : null,
  failureReasons,
  rooms: successes,
};

console.log(JSON.stringify(summary, null, 2));

if (outputPath) {
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Saved load baseline JSON to ${outputPath}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}

async function runRoomScenario(index) {
  const roomCode = createRoomCode();
  const started = performance.now();
  const host = new RealtimeClient(roomCode, `host-${index}`);
  const guest = new RealtimeClient(roomCode, `guest-${index}`);

  try {
    await Promise.all([host.open(), guest.open()]);

    const hostCreateAck = await host.command("client:room:create", {
      roomCode,
      nickname: `LoadHost${index}`,
      guestId: `load_host_${crypto.randomUUID().replaceAll("-", "")}`,
      sessionId: crypto.randomUUID(),
      deviceKind: "desktop",
    });
    assertAckOk(hostCreateAck, "room create");

    const guestJoinAck = await guest.command("client:room:join", {
      roomCode,
      nickname: `LoadGuest${index}`,
      guestId: `load_guest_${crypto.randomUUID().replaceAll("-", "")}`,
      sessionId: crypto.randomUUID(),
      deviceKind: "desktop",
    });
    assertAckOk(guestJoinAck, "room join");

    const hostPlayerId = hostCreateAck.payload?.data?.playerId;
    const guestPlayerId = guestJoinAck.payload?.data?.playerId;
    if (typeof hostPlayerId !== "string" || typeof guestPlayerId !== "string") {
      throw new Error("room setup did not return both player IDs");
    }

    // ready / typing:progress are fire-and-forget protocol events. Waiting for
    // server:ack here would always time out, so confirm them through the
    // authoritative room-state broadcasts instead.
    host.send("client:player:ready", { roomCode, ready: true });
    guest.send("client:player:ready", { roomCode, ready: true });

    await host.waitFor((message) => {
      if (message.type !== "server:room:state") return false;
      const players = message.payload?.players;
      return Array.isArray(players) && players.length === 2 && players.every((player) => player.ready === true);
    });

    const startAck = await host.command("client:match:start", { roomCode });
    assertAckOk(startAck, "match start");

    const startedMessage = await host.waitFor((message) => message.type === "server:match:started");
    const typing = startedMessage.payload?.prompt?.typing?.romaji ?? startAck.payload?.data?.prompt?.typing?.romaji;
    if (typeof typing !== "string" || typing.length === 0) {
      throw new Error("match started without a romaji prompt");
    }

    const input = Array.from(typing).slice(0, 4).join("");
    host.send("client:typing:progress", { roomCode, input, sequence: 1 });
    guest.send("client:typing:progress", { roomCode, input, sequence: 1 });

    await host.waitFor((message) => {
      if (message.type !== "server:room:state" && message.type !== "server:player:progress") return false;
      const players = message.payload?.players;
      if (Array.isArray(players)) {
        return players.some((player) =>
          (player.id === hostPlayerId || player.id === guestPlayerId) && (player.progressIndex ?? 0) > 0,
        );
      }
      return (message.payload?.progressIndex ?? 0) > 0;
    });

    return {
      roomCode,
      setupLatencyMs: Math.round(performance.now() - started),
      ok: true,
    };
  } finally {
    host.leave();
    guest.leave();
    host.close();
    guest.close();
  }
}

class RealtimeClient {
  constructor(roomCode, label) {
    this.roomCode = roomCode;
    this.label = label;
    this.socket = null;
    this.inbox = [];
    this.waiters = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      const wsUrl = new URL(`/rooms/${this.roomCode}/socket`, workerUrl);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(wsUrl);
      this.socket = socket;

      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`${this.label}: WebSocket open timed out`));
      }, timeoutMs);

      socket.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`${this.label}: ${error.message}`));
      });
      socket.on("message", (raw) => this.onMessage(raw));
    });
  }

  send(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.label}: socket is not open`);
    }

    this.socket.send(JSON.stringify({ id: crypto.randomUUID(), type, payload }));
  }

  command(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`${this.label}: socket is not open`));
    }

    const id = crypto.randomUUID();
    this.socket.send(JSON.stringify({ id, type, payload }));
    return this.waitFor((message) => message.type === "server:ack" && message.replyTo === id);
  }

  waitFor(predicate) {
    const existingIndex = this.inbox.findIndex(predicate);
    if (existingIndex >= 0) {
      const [message] = this.inbox.splice(existingIndex, 1);
      return Promise.resolve(message);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error(`${this.label}: message wait timed out`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, timer });
    });
  }

  onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }

    this.inbox.push(message);
    if (this.inbox.length > 100) this.inbox.shift();
  }

  leave() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.send("client:room:leave", { roomCode: this.roomCode });
  }

  close() {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
    }
    this.waiters = [];
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close();
    }
  }
}

function assertAckOk(message, stage) {
  if (!message?.payload?.ok) {
    throw new Error(`${stage} failed: ${message?.payload?.error ?? "unknown error"}`);
  }
}

function readTargetUrl() {
  const raw = process.env.CLOUDFLARE_WORKER_URL?.trim();
  if (!raw) fail("CLOUDFLARE_WORKER_URL is required.");
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fail("CLOUDFLARE_WORKER_URL must use http or https.");
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    fail("CLOUDFLARE_WORKER_URL must be a valid URL.");
  }
}

function assertAllowedTarget(url) {
  const hostname = url.hostname.toLowerCase();
  const allowed = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".workers.dev");
  if (!allowed) {
    fail("Refusing target. Load baseline is limited to localhost or an explicitly owned *.workers.dev Worker.");
  }
}

function readBoundedInteger(name, fallback, min, max) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function createRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

function percentile(sortedValues, percentileValue) {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1));
  return sortedValues[index];
}

function normalizeFailure(error) {
  return { message: error instanceof Error ? error.message : String(error) };
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
