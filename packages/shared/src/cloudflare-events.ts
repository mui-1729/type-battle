import type {
  CreateRoomData,
  CreateRoomPayload,
  JoinRoomData,
  JoinRoomPayload,
  PracticeSessionData,
  ReadyPayload,
  RoomCodePayload
} from "./events.js";
import type {
  AckResponse,
  BotDifficulty,
  EquipmentSelection,
  MatchResult,
  MatchRule,
  PromptCategory,
  QuickReaction,
  RoomState,
  TypingFinish,
  TypingProgress
} from "./game-state.js";

export type MatchmakingPlayerSummary = {
  id: string;
  nickname: string;
};

export type MatchmakingMatchedPayload = {
  roomCode: string;
  role: "host" | "guest";
  opponent: MatchmakingPlayerSummary;
};

export type MatchmakingJoinResponse =
  | {
      status: "queued";
      ticketId: string;
      expiresAt: number;
    }
  | ({ status: "matched" } & MatchmakingMatchedPayload);

type CloudflareClientCommandMap = {
  "client:room:create": {
    request: CreateRoomPayload;
    response: CreateRoomData;
  };
  "client:room:join": {
    request: JoinRoomPayload;
    response: JoinRoomData;
  };
  "client:room:leave": {
    request: RoomCodePayload;
    response: RoomState | null;
  };
  "client:player:ready": {
    request: ReadyPayload;
    response: RoomState;
  };
  "client:player:reaction": {
    request: RoomCodePayload & { reaction: QuickReaction };
    response: null;
  };
  "client:player:equipment": {
    request: RoomCodePayload & EquipmentSelection;
    response: null;
  };
  "client:room:setPromptCategory": {
    request: RoomCodePayload & { category: PromptCategory };
    response: RoomState;
  };
  "client:room:setBotDifficulty": {
    request: RoomCodePayload & { difficulty: BotDifficulty };
    response: RoomState;
  };
  "client:room:setMatchRule": {
    request: RoomCodePayload & { rule: MatchRule };
    response: RoomState;
  };
  "client:match:start": {
    request: RoomCodePayload;
    response: RoomState;
  };
  "client:typing:progress": {
    request: TypingProgress;
    response: RoomState | MatchResult;
  };
  "client:typing:finish": {
    request: TypingFinish;
    response: RoomState | MatchResult;
  };
  "client:match:rematch": {
    request: RoomCodePayload;
    response: RoomState;
  };
  "client:practice:start": {
    request: { nickname: string; category: PromptCategory };
    response: PracticeSessionData;
  };
  "client:practice:dailyStart": {
    request: { nickname: string };
    response: PracticeSessionData;
  };
  "client:matchmaking:join": {
    request: {
      guestId: string;
      nickname: string;
      blockedGuestIds?: string[];
    };
    response: MatchmakingJoinResponse;
  };
  "client:matchmaking:cancel": {
    request: { guestId: string };
    response: { cancelled: boolean };
  };
};

type CloudflareServerEventMap = {
  "server:room:state": RoomState;
  "server:player:progress": RoomState;
  "server:match:countdown": {
    room: RoomState;
    serverStartAt: number;
  };
  "server:match:started": RoomState;
  "server:match:result": MatchResult;
  "server:error": {
    message: string;
  };
  "server:player:reaction": {
    playerId: string;
    reaction: QuickReaction;
  };
  "server:matchmaking:matched": MatchmakingMatchedPayload;
  "server:matchmaking:timeout": {
    ticketId: string;
    fallback: "com";
  };
};

export const CLOUDFLARE_CLIENT_MESSAGE_TYPES = [
  "client:room:create",
  "client:room:join",
  "client:room:leave",
  "client:player:ready",
  "client:player:reaction",
  "client:player:equipment",
  "client:room:setPromptCategory",
  "client:room:setBotDifficulty",
  "client:room:setMatchRule",
  "client:match:start",
  "client:typing:progress",
  "client:typing:finish",
  "client:match:rematch",
  "client:practice:start",
  "client:practice:dailyStart",
  "client:matchmaking:join",
  "client:matchmaking:cancel"
] as const satisfies readonly CloudflareClientMessageType[];

export const CLOUDFLARE_SERVER_EVENT_TYPES = [
  "server:room:state",
  "server:player:progress",
  "server:match:countdown",
  "server:match:started",
  "server:match:result",
  "server:error",
  "server:player:reaction",
  "server:matchmaking:matched",
  "server:matchmaking:timeout"
] as const satisfies readonly CloudflareServerEventType[];

export type CloudflareClientMessageType = keyof CloudflareClientCommandMap;
export type CloudflareServerEventType = keyof CloudflareServerEventMap;

export type CloudflareRequestEnvelope<TType extends CloudflareClientMessageType = CloudflareClientMessageType> =
  TType extends CloudflareClientMessageType
    ? {
        id: string;
        type: TType;
        payload: CloudflareClientCommandMap[TType]["request"];
      }
    : never;

export type CloudflareAckEnvelope<TType extends CloudflareClientMessageType = CloudflareClientMessageType> =
  TType extends CloudflareClientMessageType
    ? {
        id: string;
        type: "server:ack";
        replyTo: string;
        command: TType;
        payload: AckResponse<CloudflareClientCommandMap[TType]["response"]>;
      }
    : never;

export type CloudflareServerEventEnvelope<TType extends CloudflareServerEventType = CloudflareServerEventType> =
  TType extends CloudflareServerEventType
    ? {
        id: string;
        type: TType;
        payload: CloudflareServerEventMap[TType];
      }
    : never;

export type CloudflareServerMessage = CloudflareAckEnvelope | CloudflareServerEventEnvelope;
export type CloudflareClientMessage = CloudflareRequestEnvelope;
export type CloudflareRequestPayload<TType extends CloudflareClientMessageType> =
  CloudflareClientCommandMap[TType]["request"];
export type CloudflareResponsePayload<TType extends CloudflareClientMessageType> =
  CloudflareClientCommandMap[TType]["response"];
export type CloudflareServerEventPayload<TType extends CloudflareServerEventType> =
  CloudflareServerEventMap[TType];

export type CloudflareClientEventName = CloudflareClientMessageType;
export type CloudflareServerEventName = CloudflareServerEventType;
export type CloudflareInboundMessage = CloudflareServerMessage;