import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomState } from "@type-battle/shared";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const workerEntryPoint = join(repoRoot, "apps/cloudflare-worker/src/worker.ts");

let bundledWorkerScript = "";

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
      GATEWAY: "GatewayDurableObject",
      ROOMS: "RoomDurableObject"
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
    const response = await mf.dispatchFetch(url);

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
    const roomCode = "AB12CD";
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
      const response = await secondRuntime.dispatchFetch(`https://example.com/rooms/${roomCode}/state`);
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
});
