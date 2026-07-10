import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomState } from "@type-battle/shared";
import { GATEWAY_ROOM_RATE_LIMIT_PATH } from "../src/realtime-gateway.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const workerEntryPoint = join(repoRoot, "apps/cloudflare-worker/src/worker.ts");

let bundledWorkerScript = "";

type RuntimeWebSocket = {
  accept(): void;
  addEventListener(type: "message", handler: (event: { data: unknown }) => void): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
};

async function createRuntime(persistenceDir: string): Promise<Miniflare> {
  if (!bundledWorkerScript) {
    const result = await build({
      entryPoints: [workerEntryPoint],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false
    });

    bundledWorkerScript = result.outputFiles[0]?.text ?? "";
  }

  return new Miniflare({
    script: bundledWorkerScript,
    modules: true,
    compatibilityDate: "2026-07-04",
    durableObjects: {
      GATEWAY: "RoomDurableObject",
      ROOMS: "RoomAuthorityDurableObject"
    },
    durableObjectsPersist: persistenceDir,
    bindings: {
      ROOM_STATE_WRITE_TOKEN: "secret-token"
    }
  });
}

function createExpiredRoomSnapshot(roomCode: string): { room: RoomState; disconnectedAt: Record<string, number> } {
  const now = Date.now();

  return {
    room: {
      roomCode,
      hostPlayerId: "guest-alice",
      status: "playing",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      players: [
        {
          id: "guest-alice",
          nickname: "Alice",
          connected: false,
          ready: false,
          isHost: true,
          isBot: false,
          progressIndex: 0,
          correctCharacters: 0,
          totalTypedCharacters: 0,
          mistakes: 0,
          wpm: 0,
          accuracy: 100,
          currentStreak: 0,
          maxStreak: 0
        }
      ],
      maxPlayers: 2
    },
    disconnectedAt: {
      "guest-alice": now - 40_000
    }
  };
}

async function waitForRoomState(
  mf: Miniflare,
  roomCode: string,
  predicate: (room: RoomState) => boolean
): Promise<RoomState> {
  const url = `https://example.com/rooms/${roomCode}/state`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await mf.dispatchFetch(url, {
      headers: {
        authorization: "Bearer secret-token"
      }
    });

    if (response.status === 200) {
      const body = (await response.json()) as { ok?: boolean; room?: RoomState };
      if (body.room && predicate(body.room)) {
        return body.room;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("room state did not satisfy predicate in time");
}

function waitForSocketMessage(
  socket: RuntimeWebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("websocket message did not satisfy predicate in time"));
    }, 1_000);

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      const message = JSON.parse(event.data) as Record<string, unknown>;

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      resolve(message);
    });
  });
}

describe("cloudflare worker runtime", () => {
  let persistenceDir = "";

  beforeAll(async () => {
    persistenceDir = await mkdtemp(join(tmpdir(), "type-battle-mf-"));
  });

  afterAll(async () => {
    if (persistenceDir) {
      await rm(persistenceDir, { recursive: true, force: true });
    }
  });

  it("stores room state through the room authority durable object and restores it after restart", { timeout: 15_000 }, async () => {
    const roomCode = "AB23CD";
    const snapshot = createExpiredRoomSnapshot(roomCode);

    const firstRuntime = await createRuntime(persistenceDir);
    try {
      const writeResponse = await firstRuntime.dispatchFetch(`https://example.com/rooms/${roomCode.toLowerCase()}/state`, {
        method: "PUT",
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json"
        },
        body: JSON.stringify(snapshot)
      });

      expect(writeResponse.status).toBe(200);
      const writeBody = (await writeResponse.json()) as { ok?: boolean; roomCode?: string };
      expect(writeBody).toMatchObject({
        ok: true,
        roomCode
      });

      const updatedRoom = await waitForRoomState(firstRuntime, roomCode, (room) => {
        const player = room.players.find((entry) => entry.id === "guest-alice");
        return room.status === "finished" && Boolean(player?.forfeited);
      });

      expect(updatedRoom.status).toBe("finished");
      expect(updatedRoom.players.find((player) => player.id === "guest-alice")).toMatchObject({
        forfeited: true
      });
    } finally {
      await firstRuntime.dispose();
    }

    const secondRuntime = await createRuntime(persistenceDir);
    try {
      const response = await secondRuntime.dispatchFetch(`https://example.com/rooms/${roomCode}/state`, {
        headers: {
          authorization: "Bearer secret-token"
        }
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok?: boolean; room?: RoomState };

      expect(body).toMatchObject({
        ok: true,
        room: expect.objectContaining({
          roomCode,
          status: "finished"
        })
      });
      expect(body.room?.players.find((player) => player.id === "guest-alice")).toMatchObject({
        forfeited: true
      });
    } finally {
      await secondRuntime.dispose();
    }
  });

  it("checks central room rate limits through the gateway durable object fetch stub", async () => {
    const runtime = await createRuntime(persistenceDir);

    try {
      const gatewayNamespace = await runtime.getDurableObjectNamespace("GATEWAY");
      const gateway = gatewayNamespace.getByName("gateway");
      const response = await gateway.fetch(
        `https://type-battle.internal${GATEWAY_ROOM_RATE_LIMIT_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            action: "create",
            clientIp: "127.0.0.1",
            guestId: "guest-runtime-rate-limit"
          })
        }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      await runtime.dispose();
    }
  });

  it("creates a room through the worker and room authority durable object bindings", async () => {
    const runtime = await createRuntime(persistenceDir);
    const roomCode = "CD34EF";

    try {
      const response = await runtime.dispatchFetch(`https://example.com/rooms/${roomCode}/socket`, {
        headers: {
          upgrade: "websocket"
        }
      });

      expect(response.status).toBe(101);
      expect(response.webSocket).toBeDefined();
      const socket = response.webSocket;
      if (!socket) {
        throw new Error("websocket response missing client socket");
      }

      socket.accept();
      const ackPromise = waitForSocketMessage(
        socket,
        (message) => message.type === "server:ack" && message.command === "client:room:create"
      );

      socket.send(JSON.stringify({
        id: "msg-create-runtime",
        type: "client:room:create",
        payload: {
          nickname: "Alice",
          guestId: "guest-runtime-create",
          sessionId: "session-runtime-create"
        }
      }));

      const ack = await ackPromise;

      expect(ack).toMatchObject({
        payload: {
          ok: true,
          data: {
            roomCode,
            playerId: "guest-runtime-create"
          }
        }
      });

      socket.close(1000, "test complete");
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects the gateway internal rate-limit endpoint at the worker boundary", async () => {
    const runtime = await createRuntime(persistenceDir);

    try {
      const response = await runtime.dispatchFetch(`https://example.com${GATEWAY_ROOM_RATE_LIMIT_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "create",
          clientIp: "127.0.0.1",
          guestId: "guest-runtime-rate-limit"
        })
      });

      expect(response.status).toBe(403);
    } finally {
      await runtime.dispose();
    }
  });
});
