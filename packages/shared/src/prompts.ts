import type { Prompt } from "./game-state.js";

export const PROMPTS: Prompt[] = [
  {
    id: "focus-fast",
    text: "Focus on accuracy first and speed will follow."
  },
  {
    id: "small-steps",
    text: "Small steady steps beat rushed mistakes in a close race."
  },
  {
    id: "clean-code",
    text: "Clean code is easier to change when the game grows."
  },
  {
    id: "online-room",
    text: "Share the room code and start the match when both players are ready."
  },
  {
    id: "typing-flow",
    text: "Keep your rhythm calm and let every correct key move you forward."
  }
];

export function pickPrompt(seed = Date.now()): Prompt {
  const index = Math.abs(seed) % PROMPTS.length;
  const fallback = PROMPTS[0];

  if (!fallback) {
    throw new Error("PROMPTS must contain at least one prompt.");
  }

  return PROMPTS[index] ?? fallback;
}
