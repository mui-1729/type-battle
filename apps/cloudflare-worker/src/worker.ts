import type { RoomState } from "@type-battle/shared";
import { RoomSocketHub } from "./room-socket-hub.js";
import { normalizeRoomCode, resolveRoomRoute } from "./room-routing.js";

export interface Env {
  ROOMS: DurableObjectNamespace;
  ROOM_STATE_WRITE_TOKEN: string;
}

const ROOM_STATE_STORAGE_KEY = "room-state";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = resolveRoomRoute(url.pathname);

    if (!route) {
      return new Response("Not found", { status: 404 });
    }

    if (route.action === "state" && (request.method === "POST" || request.method === "PUT")) {
      if (!isAuthorizedStateWrite(request, env)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const roomId = env.ROOMS.idFromName(route.roomCode);
    const roomStub = env.ROOMS.get(roomId);
    return roomStub.fetch(request);
  }
} satisfies ExportedHandler<Env>;

export class RoomDurableObject {
  private hub: RoomSocketHub | null = null;
  private hydration: Promise<void> | null = null;

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const route = resolveRoomRoute(new URL(request.url).pathname);

    if (!route) {
      return new Response("Not found", { status: 404 });
    }

    const hub = this.getHub(route.roomCode);
    await this.hydrateRoomState(hub);

    if (route.action === "state" && (request.method === "POST" || request.method === "PUT")) {
      const room = await parseRoomState(request, route.roomCode);

      if (!room) {
        return new Response("Invalid room state", { status: 400 });
      }

      try {
        await this.state.storage.put(ROOM_STATE_STORAGE_KEY, room);
        hub.setRoomState(room);
      } catch {
        return new Response("Failed to persist room state", { status: 500 });
      }

      return Response.json({
        ok: true,
        roomCode: hub.roomCode,
        connectedSockets: hub.connectedCount
      });
    }

    if (route.action === "socket") {
      return handleSocketUpgrade(request, hub);
    }

    return Response.json({
      ok: true,
      roomCode: hub.roomCode,
      connectedSockets: hub.connectedCount,
      hasRoomState: hub.snapshot !== null
    });
  }

  private getHub(roomCode: string): RoomSocketHub {
    if (!this.hub) {
      this.hub = new RoomSocketHub(roomCode);
    }

    return this.hub;
  }

  private async hydrateRoomState(hub: RoomSocketHub): Promise<void> {
    if (this.hydration) {
      await this.hydration;
      return;
    }

    this.hydration = this.state.blockConcurrencyWhile(async () => {
      const storedRoom = await this.state.storage.get<RoomState>(ROOM_STATE_STORAGE_KEY);

      if (storedRoom) {
        hub.setRoomState(storedRoom);
      }
    });

    await this.hydration;
  }
}

function isAuthorizedStateWrite(request: Request, env: Env): boolean {
  if (!env.ROOM_STATE_WRITE_TOKEN) {
    return false;
  }

  return request.headers.get("Authorization") === `Bearer ${env.ROOM_STATE_WRITE_TOKEN}`;
}

async function handleSocketUpgrade(request: Request, target: RoomSocketHub): Promise<Response> {
  const upgradeHeader = request.headers.get("Upgrade");

  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 400 });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  target.attach(server);

  const responseInit: ResponseInit & { webSocket: WebSocket } = {
    status: 101,
    webSocket: client
  };

  return new Response(null, responseInit);
}

async function parseRoomState(request: Request, expectedRoomCode: string): Promise<RoomState | null> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const room = payload as RoomState;

  if (typeof room.roomCode !== "string") {
    return null;
  }

  const roomCode = normalizeRoomCode(room.roomCode);

  if (roomCode !== expectedRoomCode) {
    return null;
  }

  return {
    ...room,
    roomCode: expectedRoomCode
  };
}
