import type { Prompt, PromptCategory } from "./game-state.js";

export const PROMPTS: Prompt[] = [
  { id: "s1", text: "Go.", category: "short" },
  { id: "s2", text: "Fast.", category: "short" },
  { id: "standard-1", text: "Focus on accuracy first and speed will follow.", category: "standard" },
  { id: "standard-2", text: "Small steady steps beat rushed mistakes in a close race.", category: "standard" },
  { id: "long-1", text: "This is a much longer prompt designed to test endurance and sustained typing focus over a longer period of time, which is essential for building real proficiency.", category: "long" }
];

export function pickPrompt(category: PromptCategory = "standard", seed = Date.now()): Prompt {
  const filtered = PROMPTS.filter((p) => p.category === category);
  const index = Math.abs(seed) % filtered.length;
  return filtered[index] ?? PROMPTS[0]!;
}
