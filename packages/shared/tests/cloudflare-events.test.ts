import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_CLIENT_MESSAGE_TYPES,
  CLOUDFLARE_SERVER_EVENT_TYPES,
  type CloudflareAckEnvelope,
  type CloudflareClientMessage,
  type CloudflareServerMessage
} from "../src/index.js";

describe("cloudflare events", () => {
  const createRoomMessage = {
    id: "msg_create_room",
    type: "client:room:create",
    payload: {
      roomCode: "ABC123",
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

  const assertClientMessage = (message: CloudflareClientMessage) => message;

  assertClientMessage({
    id: "msg_invalid_create_room",
    type: "client:typing:finish",
    payload: {
      // @ts-expect-error request payloads must stay coupled to their message type
      nickname: "Alice",
      guestId: "guest_alice",
      sessionId: "session_alice"
    }
  });

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

  const assertAckEnvelope = (message: CloudflareAckEnvelope) => message;

  assertAckEnvelope({
    id: "ack_invalid_create_room",
    type: "server:ack",
    replyTo: "msg_invalid_create_room",
    command: "client:room:join",
    payload: {
      ok: true,
      data: {
        // @ts-expect-error ack command payloads must stay coupled to their command
        roomCode: "ABC123",
        playerId: "player_1",
        room: {
          roomCode: "ABC123",
          hostPlayerId: "player_1",
          status: "waiting",
          matchRule: "race",
          botDifficulty: "normal",
          promptCategory: "standard",
          players: [],
          maxPlayers: 2
        }
      }
    }
  });

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

  const assertServerMessage = (message: CloudflareServerMessage) => message;

  assertServerMessage({
    id: "state_invalid",
    type: "server:room:state",
    payload: {
      // @ts-expect-error server events must keep their discriminant and payload aligned
      message: "boom"
    }
  });

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
