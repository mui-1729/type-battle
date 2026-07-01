import type {
  AckResponse,
  BotDifficulty,
  DeviceKind,
  MatchRule,
  MatchResult,
  Prompt,
  PromptCategory,
  RoomState,
  TypingFinish,
  TypingProgress
} from "./game-state.js";

export type JoinRoomPayload = {
  roomCode: string;
  nickname: string;
  guestId: string;
  sessionId: string;
  deviceKind?: DeviceKind;
};

export type CreateRoomPayload = {
  nickname: string;
  guestId: string;
  sessionId: string;
  deviceKind?: DeviceKind;
};

export type RoomCodePayload = {
  roomCode: string;
};

export type ReadyPayload = RoomCodePayload & {
  ready: boolean;
};

export type PracticeSessionData = {
  practiceId: string;
  prompt: Prompt;
  startedAt: number;
  challengeKey?: string;
};

export type CreateRoomData = {
  roomCode: string;
  playerId: string;
  room: RoomState;
};

export type JoinRoomData = {
  playerId: string;
  room: RoomState;
};

export type ClientToServerEvents = {
  "room:create": (
    payload: CreateRoomPayload,
    ack: (response: AckResponse<CreateRoomData>) => void
  ) => void;
  "room:join": (
    payload: JoinRoomPayload,
    ack: (response: AckResponse<JoinRoomData>) => void
  ) => void;
  "room:leave": (payload: RoomCodePayload) => void;
  "player:ready": (payload: ReadyPayload) => void;
  "room:setPromptCategory": (
    payload: RoomCodePayload & { category: PromptCategory },
    ack: (response: AckResponse<RoomState>) => void
  ) => void;
  "room:setBotDifficulty": (
    payload: RoomCodePayload & { difficulty: BotDifficulty },
    ack: (response: AckResponse<RoomState>) => void
  ) => void;
  "room:setMatchRule": (
    payload: RoomCodePayload & { rule: MatchRule },
    ack: (response: AckResponse<RoomState>) => void
  ) => void;
  "match:start": (
    payload: RoomCodePayload,
    ack: (response: AckResponse<RoomState>) => void
  ) => void;
  "typing:progress": (payload: TypingProgress) => void;
  "typing:finish": (payload: TypingFinish) => void;
  "match:rematch": (
    payload: RoomCodePayload,
    ack: (response: AckResponse<RoomState>) => void
  ) => void;
  "practice:start": (
    payload: { nickname: string; category: PromptCategory },
    ack: (response: AckResponse<PracticeSessionData>) => void
  ) => void;
  "practice:dailyStart": (
    payload: { nickname: string },
    ack: (response: AckResponse<PracticeSessionData>) => void
  ) => void;
};

export type ServerToClientEvents = {
  "room:state": (room: RoomState) => void;
  "player:progress": (room: RoomState) => void;
  "match:countdown": (payload: { room: RoomState; serverStartAt: number }) => void;
  "match:started": (room: RoomState) => void;
  "match:result": (result: MatchResult) => void;
  "match:error": (payload: { message: string }) => void;
};
