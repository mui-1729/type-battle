import {
  isValidRoomCode,
  validateNickname,
  QUICK_REACTIONS
} from "@type-battle/shared";
import type {
  BotDifficulty,
  DeviceKind,
  MatchRule,
  PromptCategory,
  QuickReaction,
  RoomState
} from "@type-battle/shared";
import type {
  CloudflareClientMessageType as EventCloudflareClientMessageType,
  CloudflareServerEventEnvelope
} from "@type-battle/shared/cloudflare-events";
import { CLOUDFLARE_CLIENT_MESSAGE_TYPES } from "@type-battle/shared/cloudflare-events";
import { normalizeRoomCode } from "./room-routing.js";

export type RoomStateBroadcastMessage = CloudflareServerEventEnvelope<"server:room:state">;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export const MAX_WEB_SOCKET_MESSAGE_BYTES = 16 * 1024;
export const MAX_TYPING_INPUT_CHARS = 16;
const MAX_MESSAGE_ID_LENGTH = 80;
const MAX_IDENTIFIER_LENGTH = 96;

export type ParsedClientMessage = {
  id: string;
  type: string;
  payload: unknown;
};

export type CreateRoomPayload = {
  nickname: string;
  guestId: string;
  sessionId: string;
  deviceKind?: DeviceKind;
};

export type JoinRoomPayload = CreateRoomPayload & {
  roomCode: string;
};

export type RoomCodePayload = {
  roomCode: string;
};

export type ReadyPayload = RoomCodePayload & {
  ready: boolean;
};

export type ReactionPayload = RoomCodePayload & {
  reaction: QuickReaction;
};

export type AccessoryPayload = RoomCodePayload & {
  accessoryIndex: number;
};

export type PromptCategoryPayload = RoomCodePayload & {
  category: PromptCategory;
};

export type BotDifficultyPayload = RoomCodePayload & {
  difficulty: BotDifficulty;
};

export type MatchRulePayload = RoomCodePayload & {
  rule: MatchRule;
};

export type TypingPayload = RoomCodePayload & {
  input: string;
  sequence: number;
};

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

export function parseClientMessage(rawMessage: string): ParsedClientMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.id !== "string" ||
    parsed.id.length === 0 ||
    parsed.id.length > MAX_MESSAGE_ID_LENGTH ||
    typeof parsed.type !== "string"
  ) {
    return null;
  }

  return {
    id: parsed.id,
    type: parsed.type,
    payload: parsed.payload
  };
}

export function isCloudflareClientMessageType(type: string): type is EventCloudflareClientMessageType {
  return (CLOUDFLARE_CLIENT_MESSAGE_TYPES as readonly string[]).includes(type);
}

export function parseCreateRoomPayload(payload: unknown): CreateRoomPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nickname = readNickname(payload.nickname);
  const guestId = readIdentifier(payload.guestId);
  const sessionId = readIdentifier(payload.sessionId);
  const deviceKind = parseDeviceKind(payload.deviceKind);

  if (!nickname || !guestId || !sessionId) {
    return null;
  }

  return {
    nickname,
    guestId,
    sessionId,
    ...(deviceKind ? { deviceKind } : {})
  };
}

export function parseJoinRoomPayload(payload: unknown): JoinRoomPayload | null {
  const base = parseCreateRoomPayload(payload);
  if (!base || !isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  return roomCode ? { ...base, roomCode } : null;
}

export function parseRoomCodePayload(payload: unknown): RoomCodePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  return roomCode ? { roomCode } : null;
}

export function parseReadyPayload(payload: unknown): ReadyPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const ready = typeof payload.ready === "boolean" ? payload.ready : null;
  return roomCode && ready !== null ? { roomCode, ready } : null;
}

export function parseReactionPayload(payload: unknown): ReactionPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const reaction = typeof payload.reaction === "string" && QUICK_REACTIONS.includes(payload.reaction as QuickReaction)
    ? payload.reaction as QuickReaction
    : null;

  return roomCode && reaction ? { roomCode, reaction } : null;
}

export function parseAccessoryPayload(payload: unknown): AccessoryPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const accessoryIndex = typeof payload.accessoryIndex === "number" && Number.isInteger(payload.accessoryIndex)
    ? payload.accessoryIndex
    : null;

  return roomCode && accessoryIndex !== null && accessoryIndex >= 0 && accessoryIndex <= 3
    ? { roomCode, accessoryIndex }
    : null;
}

export function parsePromptCategoryPayload(payload: unknown): PromptCategoryPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const category = parsePromptCategory(payload.category);
  return roomCode && category ? { roomCode, category } : null;
}

export function parseBotDifficultyPayload(payload: unknown): BotDifficultyPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const difficulty = parseBotDifficulty(payload.difficulty);
  return roomCode && difficulty ? { roomCode, difficulty } : null;
}

export function parseMatchRulePayload(payload: unknown): MatchRulePayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const rule = parseMatchRule(payload.rule);
  return roomCode && rule ? { roomCode, rule } : null;
}

export function parseTypingPayload(payload: unknown): TypingPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomCode = readRoomCode(payload.roomCode);
  const input = typeof payload.input === "string" ? payload.input : null;
  const sequence = typeof payload.sequence === "number" ? payload.sequence : null;

  if (!roomCode || !isValidTypingPayloadValues(input, sequence)) {
    return null;
  }

  return { roomCode, input, sequence: sequence as number };
}

export function isValidTypingPayloadValues(input: unknown, sequence: unknown): input is string {
  return (
    typeof input === "string" &&
    Number.isSafeInteger(sequence) &&
    (sequence as number) >= 1 &&
    Array.from(input).length <= MAX_TYPING_INPUT_CHARS &&
    getUtf8ByteLength(input) <= MAX_WEB_SOCKET_MESSAGE_BYTES
  );
}

function readRoomCode(value: unknown): string | null {
  const roomCode = readString(value);
  return roomCode && isValidRoomCode(roomCode) ? normalizeRoomCode(roomCode) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readIdentifier(value: unknown): string | null {
  const text = readString(value);
  return text && text.length <= MAX_IDENTIFIER_LENGTH && /^[A-Za-z0-9_-]+$/.test(text) ? text : null;
}

function readNickname(value: unknown): string | null {
  const text = readString(value);
  return text && !validateNickname(text) ? text : null;
}

function parseDeviceKind(value: unknown): DeviceKind | null {
  return value === "mobile" || value === "desktop" ? value : null;
}

function parsePromptCategory(value: unknown): PromptCategory | null {
  return value === "short" || value === "standard" || value === "long" ? value : null;
}

function parseBotDifficulty(value: unknown): BotDifficulty | null {
  return value === "easy" || value === "normal" || value === "hard" ? value : null;
}

function parseMatchRule(value: unknown): MatchRule | null {
  return value === "race" || value === "timeAttack" || value === "hpBattle" ? value : null;
}

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function serializeRoomStateBroadcast(room: RoomState): string {
  const roomCode = normalizeRoomCode(room.roomCode);

  return JSON.stringify({
    id: createRoomStateBroadcastId(roomCode),
    type: "server:room:state",
    payload: {
      ...room,
      roomCode
    }
  } satisfies RoomStateBroadcastMessage);
}

export function parseRoomStateBroadcast(data: string): RoomStateBroadcastMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isUnknownRecord(parsed) || parsed.type !== "server:room:state") {
    return null;
  }

  if (typeof parsed.id !== "string" || !isUnknownRecord(parsed.payload)) {
    return null;
  }

  const room = parsed.payload as RoomState;

  if (typeof room.roomCode !== "string") {
    return null;
  }

  const roomCode = normalizeRoomCode(room.roomCode);

  return {
    id: parsed.id,
    type: "server:room:state",
    payload: {
      ...room,
      roomCode
    }
  };
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function createRoomStateBroadcastId(roomCode: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `room-state:${roomCode}:${randomId}`;
}
