import { describe, expect, it } from "vitest";
import {
  isCloudflareClientMessageType,
  parseClientMessage,
  parseCreateRoomPayload,
  parseJoinRoomPayload,
  parseTypingPayload
} from "../src/room-protocol.js";

describe("room protocol", () => {
  it("parses a bounded client message and validates its event type separately", () => {
    const message = parseClientMessage(JSON.stringify({
      id: "message-1",
      type: "client:room:create",
      payload: { nickname: "Alice" }
    }));

    expect(message).toEqual({
      id: "message-1",
      type: "client:room:create",
      payload: { nickname: "Alice" }
    });
    expect(isCloudflareClientMessageType(message?.type ?? "")).toBe(true);
    expect(isCloudflareClientMessageType("client:unknown")).toBe(false);
    expect(parseClientMessage("not-json")).toBeNull();
  });

  it("normalizes room creation and join payloads at the protocol boundary", () => {
    expect(parseCreateRoomPayload({
      nickname: " Alice ",
      guestId: "guest_1",
      sessionId: "session-1",
      deviceKind: "desktop"
    })).toEqual({
      nickname: "Alice",
      guestId: "guest_1",
      sessionId: "session-1",
      deviceKind: "desktop"
    });
    expect(parseJoinRoomPayload({
      nickname: "Alice",
      guestId: "guest_1",
      sessionId: "session-1",
      roomCode: " ab23cd "
    })).toMatchObject({ roomCode: "AB23CD" });
    expect(parseCreateRoomPayload({ nickname: "", guestId: "guest", sessionId: "session" })).toBeNull();
  });

  it("rejects invalid typing payloads before application logic", () => {
    expect(parseTypingPayload({ roomCode: "AB23CD", input: "k", sequence: 1 })).toEqual({
      roomCode: "AB23CD",
      input: "k",
      sequence: 1
    });
    expect(parseTypingPayload({ roomCode: "AB23CD", input: "k", sequence: 0 })).toBeNull();
    expect(parseTypingPayload({ roomCode: "AB23CD", input: "k".repeat(17), sequence: 1 })).toBeNull();
    expect(parseTypingPayload({ roomCode: "invalid", input: "k", sequence: 1 })).toBeNull();
  });
});
