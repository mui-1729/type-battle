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
  const rooms = new Map<string, { room: Record<string, unknown> }>();
  const state = {
    blockConcurrencyWhile: async (callback: () => Promise<unknown>) => await callback(),
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    }
  } as unknown as DurableObjectState;
  const namespace = {
    getByName: (roomCode: string) => ({
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname === "/__internal/matchmaking-bootstrap") {
          const input = await request.json() as {
            host: { guestId: string; nickname: string };
            guest: { guestId: string; nickname: string };
          };
          rooms.set(roomCode, {
            room: {
              roomCode,
              hostPlayerId: input.host.guestId,
              status: "waiting",
              players: [
                { id: input.host.guestId, nickname: input.host.nickname, connected: true, isHost: true, isBot: false },
                { id: input.guest.guestId, nickname: input.guest.nickname, connected: false, isHost: false, isBot: false }
              ]
            }
          });
          return Response.json({ ok: true }, { status: 201 });
        }
        return Response.json(rooms.get(roomCode) ?? { room: null });
      }
    })
  } as unknown as DurableObjectNamespace;
  const gateway = new RealtimeGatewayDurableObject(state, { ROOMS: namespace });

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
    payload: {
      guestId,
      sessionId: `${guestId}-session`,
      nickname,
      deviceKind: "desktop",
      blockedGuestIds
    }
  };
}

function matchmakingCancel(id: string, guestId: string, ticketId: string, sessionId = `${guestId}-session`) {
  return {
    id,
    type: "client:matchmaking:cancel",
    payload: { guestId, sessionId, ticketId }
  };
}

function findMessage(socket: TestSocket, type: string) {
  return socket.messages().find((message) => message.type === type);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RealtimeGatewayDurableObject matchmaking", () => {
  it("releases the guest only after the assigned host is verified connected", async () => {
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

    const assignedHost = findMessage(first, "server:matchmaking:assignedHost");
    const secondAck = second
      .messages()
      .find((message) => message.type === "server:ack" && message.replyTo === "join-b");

    expect(assignedHost).toMatchObject({
      payload: { role: "host", opponent: { id: "guest_b", nickname: "Bob" } }
    });
    expect(findMessage(second, "server:matchmaking:matched")).toBeUndefined();
    expect(secondAck).toMatchObject({
      payload: { ok: true, data: { status: "waitingHost", role: "guest" } }
    });

    const hostPayload = assignedHost?.payload as { ticketId: string; matchId: string; roomCode: string };
    first.emitMessage({
      id: "host-ready",
      type: "client:matchmaking:hostReady",
      payload: { ticketId: hostPayload.ticketId, matchId: hostPayload.matchId }
    });
    await flush();

    expect(findMessage(second, "server:matchmaking:matched")).toMatchObject({
      payload: {
        roomCode: hostPayload.roomCode,
        role: "guest",
        matchId: hostPayload.matchId,
        opponent: { id: "guest_a", nickname: "Alice" }
      }
    });
    expect(first.messages().find((message) => message.replyTo === "host-ready")).toMatchObject({
      payload: { ok: true, data: { accepted: true } }
    });
  });

  it("does not let another socket replace or cancel an existing guest ticket", async () => {
    const { gateway, flush } = createGateway();
    const owner = new TestSocket();
    const attacker = new TestSocket();
    gateway.attachSocket(owner);
    gateway.attachSocket(attacker);

    owner.emitMessage(matchmakingJoin("owner-join", "guest_shared", "Owner"));
    await flush();
    const ownerAck = owner.messages().find((message) => message.replyTo === "owner-join");
    const ownerTicketId = (ownerAck?.payload as { data: { ticketId: string } }).data.ticketId;

    attacker.emitMessage(matchmakingJoin("attacker-join", "guest_shared", "Attacker"));
    await flush();
    expect(
      attacker.messages().find((message) => message.replyTo === "attacker-join")
    ).toMatchObject({ payload: { ok: false } });

    attacker.emitMessage(matchmakingCancel(
      "attacker-cancel",
      "guest_shared",
      ownerTicketId,
      "attacker-session"
    ));
    await flush();
    expect(
      attacker.messages().find((message) => message.replyTo === "attacker-cancel")
    ).toMatchObject({ payload: { ok: true, data: { cancelled: false } } });

    owner.emitMessage(matchmakingCancel("owner-cancel", "guest_shared", ownerTicketId));
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
