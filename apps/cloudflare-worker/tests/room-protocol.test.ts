import { describe, expect, it } from "vitest";
import {
  isWebSocketUpgrade,
  isCloudflareClientMessageType,
  parseAccessoryPayload,
  parseBotDifficultyPayload,
  parseClientMessage,
  parseCreateRoomPayload,
  parseJoinRoomPayload,
  parseMatchRulePayload,
  parsePromptCategoryPayload,
  parseReactionPayload,
  parseReadyPayload,
  parseRoomCodePayload,
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

  it("validates room command payload boundaries", () => {
    expect(parseRoomCodePayload({ roomCode: " ab23cd " })).toEqual({ roomCode: "AB23CD" });
    expect(parseRoomCodePayload({ roomCode: "" })).toBeNull();

    expect(parseReadyPayload({ roomCode: "AB23CD", ready: true })).toEqual({
      roomCode: "AB23CD",
      ready: true
    });
    expect(parseReadyPayload({ roomCode: "AB23CD", ready: "true" })).toBeNull();

    expect(parseReactionPayload({ roomCode: "AB23CD", reaction: "ナイス" })).toEqual({
      roomCode: "AB23CD",
      reaction: "ナイス"
    });
    expect(parseReactionPayload({ roomCode: "AB23CD", reaction: "unknown" })).toBeNull();

    expect(parseAccessoryPayload({ roomCode: "AB23CD", accessoryIndex: 0 })).toEqual({
      roomCode: "AB23CD",
      accessoryIndex: 0
    });
    expect(parseAccessoryPayload({ roomCode: "AB23CD", accessoryIndex: 4 })).toBeNull();
    expect(parseAccessoryPayload({ roomCode: "AB23CD", accessoryIndex: 1.5 })).toBeNull();

    expect(parsePromptCategoryPayload({ roomCode: "AB23CD", category: "long" })).toEqual({
      roomCode: "AB23CD",
      category: "long"
    });
    expect(parsePromptCategoryPayload({ roomCode: "AB23CD", category: "unknown" })).toBeNull();

    expect(parseBotDifficultyPayload({ roomCode: "AB23CD", difficulty: "hard" })).toEqual({
      roomCode: "AB23CD",
      difficulty: "hard"
    });
    expect(parseBotDifficultyPayload({ roomCode: "AB23CD", difficulty: "expert" })).toBeNull();

    expect(parseMatchRulePayload({ roomCode: "AB23CD", rule: "hpBattle" })).toEqual({
      roomCode: "AB23CD",
      rule: "hpBattle"
    });
    expect(parseMatchRulePayload({ roomCode: "AB23CD", rule: "unknown" })).toBeNull();
  });

  it("requires a case-insensitive websocket upgrade header", () => {
    expect(isWebSocketUpgrade(new Request("https://example.test", { headers: { Upgrade: "WebSocket" } }))).toBe(true);
    expect(isWebSocketUpgrade(new Request("https://example.test", { headers: { Upgrade: "http" } }))).toBe(false);
    expect(isWebSocketUpgrade(new Request("https://example.test"))).toBe(false);
  });
});
