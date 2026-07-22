import type { TypingProgress } from "@type-battle/shared";

const MAX_TYPING_MESSAGE_INPUT_CHARS = 16;

export type TypingMessage = {
  event: "typing:progress" | "typing:finish";
  payload: TypingProgress;
};

export function createTypingMessageBatch(input: {
  roomCode: string;
  text: string;
  finish: boolean;
  previousSequence: number;
}): TypingMessage[] {
  const characters = Array.from(input.text);
  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += MAX_TYPING_MESSAGE_INPUT_CHARS) {
    chunks.push(characters.slice(index, index + MAX_TYPING_MESSAGE_INPUT_CHARS).join(""));
  }

  // An empty finish is still a meaningful protocol message and must advance
  // the sequence just like the pre-chunking implementation did.
  if (chunks.length === 0) {
    chunks.push("");
  }

  return chunks.map((text, index) => ({
    event: input.finish && index === chunks.length - 1 ? "typing:finish" : "typing:progress",
    payload: {
      roomCode: input.roomCode,
      input: text,
      sequence: input.previousSequence + index + 1
    }
  }));
}
