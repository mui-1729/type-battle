import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeGatewayDurableObject } from "../src/realtime-gateway";

type MessageHandler = (event: { data: unknown }) => void;
type CloseHandler = (event: CloseEvent) => void;

class TestSocket {
  readyState = 1;
  accepted = false;
  sent: string[] = [];
  private readonly messageHandlers: MessageHandler[] = [];
  private readonly closeHandlers: CloseHandler[] = [];

  accept() {
    this.accepted = true;
  }

  addEventListener(type: "message" | "close", handler: MessageHandler | CloseHandler) {
    if (type === "message") {
      this.messageHandlers.push(handler as MessageHandler);
    } else {
      this.closeHandlers.push(handler as CloseHandler);
    }
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  emitMessage(message: unknown) {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    for (const handler of this.messageHandlers) {
      handler({ data });
    }
  }

  emitClose() {
    this.readyState = 3;
    for (const handler of this.closeHandlers) {
      handler({} as CloseEvent);
    }
  }

  messages() {
    return this.sent.map((message) => JSON.parse(message) as Record<string, unknown>);
  }
}

function createGateway() {
  const pending: Promise<unknown>[] = [];
  const state = {
    blockConcurrencyWhile: async (callback: () => Promise<unknown>) => await callback(),
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    }
  } as unknown as DurableObjectState;
  const gateway = new RealtimeGatewayDurableObject(state);

  return {
    gateway,
    async flush() {
      while (pending.length > 0) {
        await Promise.all(pending.splice(0));
      }
      await Promise.resolve();
    }
  };
}

function matchmakingJoin(id: string, guestId: string, nickname: string, blockedGuestIds: string[] = []) {
  return {
    id,
    type: "client:matchmaking:join",
    payload: { guestId, nickname, blockedGuestIds }
  };
}

function matchmakingCancel(id: string, guestId: string) {
  return {
    id,
    type: "client:matchmaking:cancel",
    payload: { guestId }
  };
}

function findMessage(socket: TestSocket, type: string) {
  return socket.messages().find((message) => message.type === type);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RealtimeGatewayDurableObject matchmaking", () => {
  it("matches two sockets into the same room with host and guest roles", async () => {
    const { gateway, flush } = createGateway();
    const first = new TestSocket();
    const second = new TestSocket();
    gateway.attachSocket(first);
    gateway.attachSocket(second);

    first.emitMessage(matchmakingJoin("join-a", "guest_a", "Alice"));
    await flush();
    const firstAck = findMessage(first, "server:ack");
    expect(firstAck).toMatchObject({
      replyTo: "join-a",
      command: "client:matchmaking:join",
      payload: { ok: true, data: { status: "queued" } }
    });

    second.emitMessage(matchmakingJoin("join-b", "guest_b", "Bob"));
    await flush();

    const firstMatched = findMessage(first, "server:matchmaking:matched");
    const secondMatched = findMessage(second, "server:matchmaking:matched");
    const secondAck = second
      .messages()
      .find((message) => message.type === "server:ack" && message.replyTo === "join-b");

    expect(firstMatched).toMatchObject({
      payload: { role: "host", opponent: { id: "guest_b", nickname: "Bob" } }
    });
    expect(secondMatched).toMatchObject({
      payload: { role: "guest", opponent: { id: "guest_a", nickname: "Alice" } }
    });
    expect(secondAck).toMatchObject({
      payload: { ok: true, data: { status: "matched", role: "guest" } }
    });
    expect((firstMatched?.payload as { roomCode: string }).roomCode).toBe(
      (secondMatched?.payload as { roomCode: string }).roomCode
    );
  });

  it("does not let another socket replace or cancel an existing guest ticket", async () => {
    const { gateway, flush } = createGateway();
    const owner = new TestSocket();
    const attacker = new TestSocket();
    gateway.attachSocket(owner);
    gateway.attachSocket(attacker);

    owner.emitMessage(matchmakingJoin("owner-join", "guest_shared", "Owner"));
    await flush();

    attacker.emitMessage(matchmakingJoin("attacker-join", "guest_shared", "Attacker"));
    await flush();
    expect(
      attacker.messages().find((message) => message.replyTo === "attacker-join")
    ).toMatchObject({ payload: { ok: false } });

    attacker.emitMessage(matchmakingCancel("attacker-cancel", "guest_shared"));
    await flush();
    expect(
      attacker.messages().find((message) => message.replyTo === "attacker-cancel")
    ).toMatchObject({ payload: { ok: true, data: { cancelled: false } } });

    owner.emitMessage(matchmakingCancel("owner-cancel", "guest_shared"));
    await flush();
    expect(owner.messages().find((message) => message.replyTo === "owner-cancel")).toMatchObject({
      payload: { ok: true, data: { cancelled: true } }
    });
  });

  it("removes a queued ticket when its socket disconnects", async () => {
    const { gateway, flush } = createGateway();
    const first = new TestSocket();
    const second = new TestSocket();
    gateway.attachSocket(first);
    gateway.attachSocket(second);

    first.emitMessage(matchmakingJoin("join-a", "guest_a", "Alice"));
    await flush();
    first.emitClose();
    await flush();

    second.emitMessage(matchmakingJoin("join-b", "guest_b", "Bob"));
    await flush();
    expect(second.messages().find((message) => message.replyTo === "join-b")).toMatchObject({
      payload: { ok: true, data: { status: "queued" } }
    });
    expect(findMessage(second, "server:matchmaking:matched")).toBeUndefined();
  });

  it("sends COM fallback when a queued ticket times out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T00:00:00.000Z"));
    const { gateway, flush } = createGateway();
    const socket = new TestSocket();
    gateway.attachSocket(socket);

    socket.emitMessage(matchmakingJoin("join-a", "guest_a", "Alice"));
    await flush();
    await vi.advanceTimersByTimeAsync(25_001);

    expect(findMessage(socket, "server:matchmaking:timeout")).toMatchObject({
      payload: { fallback: "com" }
    });
  });

  it("keeps blocked guests in the queue instead of pairing them", async () => {
    const { gateway, flush } = createGateway();
    const first = new TestSocket();
    const second = new TestSocket();
    gateway.attachSocket(first);
    gateway.attachSocket(second);

    first.emitMessage(matchmakingJoin("join-a", "guest_a", "Alice", ["guest_b"]));
    await flush();
    second.emitMessage(matchmakingJoin("join-b", "guest_b", "Bob"));
    await flush();

    expect(findMessage(first, "server:matchmaking:matched")).toBeUndefined();
    expect(findMessage(second, "server:matchmaking:matched")).toBeUndefined();
    expect(second.messages().find((message) => message.replyTo === "join-b")).toMatchObject({
      payload: { ok: true, data: { status: "queued" } }
    });
  });
});
