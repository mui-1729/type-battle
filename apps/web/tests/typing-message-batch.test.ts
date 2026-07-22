import { describe, expect, it } from "vitest";
import { createTypingMessageBatch } from "../app/_lib/typing-message-batch";

describe("createTypingMessageBatch", () => {
  it("splits input by Unicode code point and increments each sequence", () => {
    const messages = createTypingMessageBatch({
      roomCode: "AB23CD",
      text: `${"a".repeat(15)}😀い`,
      finish: false,
      previousSequence: 7
    });

    expect(messages).toEqual([
      {
        event: "typing:progress",
        payload: { roomCode: "AB23CD", input: `${"a".repeat(15)}😀`, sequence: 8 }
      },
      {
        event: "typing:progress",
        payload: { roomCode: "AB23CD", input: "い", sequence: 9 }
      }
    ]);
    expect(messages.map((message) => Array.from(message.payload.input).length)).toEqual([16, 1]);
  });

  it("uses typing:finish only for the final chunk", () => {
    const messages = createTypingMessageBatch({
      roomCode: "EF34GH",
      text: "あ".repeat(33),
      finish: true,
      previousSequence: 0
    });

    expect(messages.map((message) => message.event)).toEqual([
      "typing:progress",
      "typing:progress",
      "typing:finish"
    ]);
    expect(messages.map((message) => message.payload.sequence)).toEqual([1, 2, 3]);
    expect(messages.map((message) => Array.from(message.payload.input).length)).toEqual([16, 16, 1]);
  });

  it("preserves an empty finish as one sequenced finish message", () => {
    expect(createTypingMessageBatch({
      roomCode: "JK23LM",
      text: "",
      finish: true,
      previousSequence: 4
    })).toEqual([
      {
        event: "typing:finish",
        payload: { roomCode: "JK23LM", input: "", sequence: 5 }
      }
    ]);
  });
});
