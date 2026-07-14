import { isRoomRoutePath, resolveRoomRoute } from "./room-routing.js";
import {
  GATEWAY_ROOM_RATE_LIMIT_PATH,
  RealtimeGatewayDurableObject as GatewayDurableObject
} from "./realtime-gateway.js";
import { RoomAuthorityDurableObject } from "./room-authority.js";

export interface Env {
  GATEWAY: DurableObjectNamespace;
  ROOMS: DurableObjectNamespace;
  ROOM_STATE_WRITE_TOKEN: string;
  DEPLOY_COMMIT_SHA?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "type-battle-cloudflare-worker",
        check: "liveness",
        commitSha: env.DEPLOY_COMMIT_SHA ?? "development",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/ready" || url.pathname === "/metrics") {
      const gateway = env.GATEWAY.getByName("gateway");
      return gateway.fetch(new Request(`https://type-battle.internal${url.pathname}`));
    }

    if (url.pathname === GATEWAY_ROOM_RATE_LIMIT_PATH) {
      return new Response("Forbidden", { status: 403 });
    }

    const route = resolveRoomRoute(url.pathname);

    if (!route && isRoomRoutePath(url.pathname)) {
      return new Response("Invalid room code", { status: 400 });
    }

    if (route?.action === "state") {
      if (!isAuthorizedRoomStateAccess(request, env)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    if (route?.action === "state" || route?.action === "socket") {
      return env.ROOMS.getByName(route.roomCode).fetch(request);
    }

    return env.GATEWAY.getByName("gateway").fetch(request);
  }
} satisfies ExportedHandler<Env>;

export { GatewayDurableObject, GatewayDurableObject as RoomDurableObject, RoomAuthorityDurableObject };

function isAuthorizedRoomStateAccess(request: Request, env: Env): boolean {
  if (!env.ROOM_STATE_WRITE_TOKEN) {
    return false;
  }

  return request.headers.get("Authorization") === `Bearer ${env.ROOM_STATE_WRITE_TOKEN}`;
}
