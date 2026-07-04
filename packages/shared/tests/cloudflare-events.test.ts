import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_CLIENT_MESSAGE_TYPES,
  CLOUDFLARE_SERVER_EVENT_TYPES,
  type CloudflareAckEnvelope,
  type CloudflareClientMessage,
  type CloudflareServerMessage
} from "../src";

describe("cloudflare events", () => {
  const createRoomMessage = {
    id: "msg_create_room",
    type: "client:room:create",
    payload: {
      nickname: "Alice",
      guestId: "guest_alice",
      sessionId: "session_alice"
    }
  } satisfies CloudflareClientMessage;

  const finishMessage = {
    id: "msg_finish_typing",
    type: "client:typing:finish",
    payload: {
      roomCode: "ABC123",
      progressIndex: 4,
      correctCharacters: 4,
      totalTypedCharacters: 4,
      mistakes: 0
    }
  } satisfies CloudflareClientMessage;

  const ackMessage = {
    id: "ack_create_room",
    type: "server:ack",
    replyTo: "msg_create_room",
    command: "client:room:create",
    payload: {
      ok: false,
      error: "rate_limited"
    }
  } satisfies CloudflareAckEnvelope<"client:room:create">;

  const stateMessage = {
    id: "state_1",
    type: "server:room:state",
    payload: {
      roomCode: "ABC123",
      hostPlayerId: "player_1",
      status: "waiting",
      matchRule: "race",
      botDifficulty: "normal",
      promptCategory: "standard",
      players: [],
      maxPlayers: 2
    }
  } satisfies CloudflareServerMessage;

  it("lists the supported client and server message types", () => {
    expect(CLOUDFLARE_CLIENT_MESSAGE_TYPES).toContain("client:room:create");
    expect(CLOUDFLARE_CLIENT_MESSAGE_TYPES).toContain("client:typing:finish");
    expect(CLOUDFLARE_SERVER_EVENT_TYPES).toContain("server:room:state");
    expect(CLOUDFLARE_SERVER_EVENT_TYPES).toContain("server:match:result");
  });

  it("types representative request and response envelopes", () => {
    expect(createRoomMessage.type).toBe("client:room:create");
    expect(finishMessage.type).toBe("client:typing:finish");
    expect(ackMessage.type).toBe("server:ack");
    expect(stateMessage.type).toBe("server:room:state");
  });
});
