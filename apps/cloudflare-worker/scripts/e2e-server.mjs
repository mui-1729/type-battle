import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import worker, { RoomAuthorityDurableObject, RoomDurableObject } from "../dist/src/worker.js";
import { isRoomRoutePath, resolveRoomRoute } from "../dist/src/room-routing.js";

class FakeStorage {
  constructor() {
    this.values = new Map();
    this.alarmAt = null;
    this.alarmTimer = null;
    this.alarmHandler = null;
  }

  async get(key) {
    return this.values.get(key);
  }

  async list(options) {
    const result = new Map();

    for (const [key, value] of this.values) {
      if (options?.prefix && !key.startsWith(options.prefix)) {
        continue;
      }

      result.set(key, value);
    }

    return result;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    return this.values.delete(key);
  }

  async deleteAll() {
    this.values.clear();
  }

  async setAlarm(timestamp) {
    this.alarmAt = timestamp;
    if (this.alarmTimer) {
      clearTimeout(this.alarmTimer);
    }

    this.alarmTimer = setTimeout(() => {
      this.alarmTimer = null;
      void this.alarmHandler?.();
    }, Math.max(timestamp - Date.now(), 0));
  }

  async getAlarm() {
    return this.alarmAt;
  }

  async deleteAlarm() {
    this.alarmAt = null;
    if (this.alarmTimer) {
      clearTimeout(this.alarmTimer);
      this.alarmTimer = null;
    }
  }

  async sync() {}

  async transaction(callback) {
    return await callback(this);
  }
}

class FakeDurableObjectState {
  constructor(storage) {
    this.storage = storage;
  }

  async blockConcurrencyWhile(callback) {
    return await callback();
  }

  waitUntil(promise) {
    void Promise.resolve(promise).catch(() => {});
  }
}

class FakeDurableObjectNamespace {
  constructor(DurableObjectClass, env) {
    this.DurableObjectClass = DurableObjectClass;
    this.env = env;
    this.instances = new Map();
  }

  getByName(name) {
    return this.getInstance(name);
  }

  getInstance(name) {
    const normalizedName = String(name).toUpperCase();
    const existing = this.instances.get(normalizedName);

    if (existing) {
      return existing;
    }

    const storage = new FakeStorage();
    const instance = new this.DurableObjectClass(new FakeDurableObjectState(storage), this.env);
    storage.alarmHandler = () => {
      if (typeof instance.alarm === "function") {
        void instance.alarm();
      }
    };
    this.instances.set(normalizedName, instance);
    return instance;
  }
}

class NodeWebSocketAdapter {
  constructor(socket) {
    this.socket = socket;
    this.readyState = WebSocket.CONNECTING;
    this.listeners = new Map();
    this.readyState = this.socket.readyState;

    this.socket.on("message", (data) => {
      const message = typeof data === "string" ? data : data.toString("utf8");
      this.dispatch("message", { data: message });
    });

    this.socket.on("close", () => {
      this.readyState = WebSocket.CLOSED;
      this.dispatch("close", {});
    });
  }

  accept() {
    this.readyState = WebSocket.OPEN;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? new Set();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  close(code, reason) {
    this.socket.close(code ?? 1000, reason);
  }

  send(data) {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(data);
  }

  dispatch(type, event) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

async function main() {
  const port = Number(process.env.PORT ?? 8787);
  const env = {
    ROOM_STATE_WRITE_TOKEN: "e2e-token"
  };
  const gatewayNamespace = new FakeDurableObjectNamespace(RoomDurableObject, env);
  const roomNamespace = new FakeDurableObjectNamespace(RoomAuthorityDurableObject, env);

  env.GATEWAY = gatewayNamespace;
  env.ROOMS = roomNamespace;

  await gatewayNamespace.getByName("gateway").ready;

  const server = http.createServer(async (request, response) => {
    try {
      const webRequest = await toWebRequest(request);
      const webResponse = await worker.fetch(webRequest, env);
      await writeWebResponse(response, webResponse);
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "Internal error"
        })
      );
    }
  });

  const webSocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      const route = resolveRoomRoute(url.pathname);
      if (!route && isRoomRoutePath(url.pathname)) {
        webSocket.close(1008, "Invalid room code");
        return;
      }

      const adapter = new NodeWebSocketAdapter(webSocket);
      const target = route?.action === "socket"
        ? roomNamespace.getByName(route.roomCode)
        : gatewayNamespace.getByName("gateway");

      target.attachSocket(adapter, {
        clientIp: readClientIp(request),
        ...(route?.action === "socket" ? { roomCode: route.roomCode } : {})
      });
    });
  });

  server.listen(port, "127.0.0.1");
}

async function toWebRequest(request) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    if (typeof value === "string") {
      headers.set(name, value);
    }
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const method = request.method ?? "GET";

  if (method === "GET" || method === "HEAD") {
    return new Request(url, {
      method,
      headers
    });
  }

  const body = await readRequestBody(request);
  return new Request(url, {
    method,
    headers,
    body: body.length > 0 ? body : undefined
  });
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function writeWebResponse(response, webResponse) {
  response.statusCode = webResponse.status;
  response.statusMessage = webResponse.statusText;

  webResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });

  if (!webResponse.body) {
    response.end();
    return;
  }

  const body = Buffer.from(await webResponse.arrayBuffer());
  response.end(body);
}

function readClientIp(request) {
  const connectingIp = request.headers["cf-connecting-ip"];
  if (typeof connectingIp === "string" && connectingIp.length > 0) {
    return connectingIp;
  }

  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  const remoteAddress = request.socket.remoteAddress ?? "127.0.0.1";
  const remotePort = request.socket.remotePort ?? 0;
  return `${remoteAddress}:${remotePort}`;
}

void main();
