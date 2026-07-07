import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { RealtimeGatewayDurableObject } from "../../../apps/cloudflare-worker/src/realtime-gateway.js";

const PORT = Number(process.env.CLOUDFLARE_WORKER_PORT ?? 3001);
const HOST = process.env.CLOUDFLARE_WORKER_HOST ?? "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

type StorageRecord = Map<string, unknown>;

class MemoryStorage {
  readonly values: StorageRecord = new Map();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    for (const [key, value] of this.values.entries()) {
      if (options?.prefix && !key.startsWith(options.prefix)) {
        continue;
      }

      result.set(key, value as T);
    }

    return result;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
  }

  async sync(): Promise<void> {}
}

class LocalDurableObjectState {
  constructor(public readonly storage: MemoryStorage) {}

  async blockConcurrencyWhile<T>(callback: () => Promise<T> | T): Promise<T> {
    return await callback();
  }
}

class LocalCloudflareSocket {
  private readonly listeners = new Map<string, Set<(event: { data?: string }) => void>>();

  constructor(private readonly socket: WebSocket) {
    this.socket.on("message", (data) => {
      const payload =
        typeof data === "string"
          ? data
          : Array.isArray(data)
            ? Buffer.concat(data).toString("utf8")
            : Buffer.isBuffer(data)
              ? data.toString("utf8")
              : data instanceof ArrayBuffer
                ? Buffer.from(data).toString("utf8")
                : String(data);

      this.dispatch("message", { data: payload });
    });

    this.socket.on("close", (code, reason) => {
      this.dispatch("close", { code, reason: reason.toString("utf8") } as never);
    });
  }

  get readyState(): number {
    return this.socket.readyState;
  }

  accept(): void {}

  addEventListener(type: "message" | "close", handler: (event: { data?: string }) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: { data?: string }) => void>();
    listeners.add(handler);
    this.listeners.set(type, listeners);
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  send(data: string): void {
    this.socket.send(data);
  }

  private dispatch(type: "message" | "close", event: { data?: string } | never): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event as never);
    }
  }
}

async function main(): Promise<void> {
  const storage = new MemoryStorage();
  const gateway = new RealtimeGatewayDurableObject(
    new LocalDurableObjectState(storage) as unknown as DurableObjectState
  );

  await gateway.ready;

  const server = createServer(async (request, response) => {
    if (!request.url || !request.method) {
      response.statusCode = 400;
      response.end("Bad request");
      return;
    }

    const body = await readRequestBody(request);
    const headers = new Headers();

    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }

    const fetchRequest = new Request(new URL(request.url, BASE_URL), {
      method: request.method,
      headers,
      ...(body.length > 0 ? { body: body.toString("utf8") } : {})
    });

    const fetchedResponse = await gateway.fetch(fetchRequest);
    response.statusCode = fetchedResponse.status;

    for (const [key, value] of fetchedResponse.headers.entries()) {
      response.setHeader(key, value);
    }

    const responseBody = await fetchedResponse.arrayBuffer();
    response.end(Buffer.from(responseBody));
  });

  const socketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (!request.url) {
      socket.destroy();
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (ws) => {
      const localSocket = new LocalCloudflareSocket(ws);
      gateway.attachSocket(localSocket);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`Cloudflare worker dev server listening on ${BASE_URL}`);
      resolve();
    });
  });

  const shutdown = async () => {
    socketServer.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

async function readRequestBody(request: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

void main();
