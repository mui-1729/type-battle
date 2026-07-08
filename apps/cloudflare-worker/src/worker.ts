import { resolveRoomRoute } from "./room-routing.js";
import { RealtimeGatewayDurableObject as RoomDurableObject } from "./realtime-gateway.js";

export interface Env {
  ROOMS: DurableObjectNamespace;
  ROOM_STATE_WRITE_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-worker",
        timestamp: new Date().toISOString()
      });
    }

    const route = resolveRoomRoute(url.pathname);

    if (route?.action === "state" && (request.method === "POST" || request.method === "PUT")) {
      if (!isAuthorizedStateWrite(request, env)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    return env.ROOMS.getByName("gateway").fetch(request);
  }
} satisfies ExportedHandler<Env>;

export { RoomDurableObject };

function isAuthorizedStateWrite(request: Request, env: Env): boolean {
  if (!env.ROOM_STATE_WRITE_TOKEN) {
    return false;
  }

  return request.headers.get("Authorization") === `Bearer ${env.ROOM_STATE_WRITE_TOKEN}`;
}
