import type { CreateRoomData, CreateRoomPayload, JoinRoomData, JoinRoomPayload, PracticeSessionData, ReadyPayload, RoomCodePayload } from "./events.js";
import type {
  AckResponse,
  BotDifficulty,
  MatchResult,
  MatchRule,
  PromptCategory,
  RoomState,
  TypingFinish,
  TypingProgress
} from "./game-state.js";

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
    response: RoomState;
  };
  "client:player:ready": {
    request: ReadyPayload;
    response: RoomState;
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
};

export const CLOUDFLARE_CLIENT_MESSAGE_TYPES = [
  "client:room:create",
  "client:room:join",
  "client:room:leave",
  "client:player:ready",
  "client:room:setPromptCategory",
  "client:room:setBotDifficulty",
  "client:room:setMatchRule",
  "client:match:start",
  "client:typing:progress",
  "client:typing:finish",
  "client:match:rematch",
  "client:practice:start",
  "client:practice:dailyStart"
] as const satisfies readonly CloudflareClientMessageType[];

export const CLOUDFLARE_SERVER_EVENT_TYPES = [
  "server:room:state",
  "server:player:progress",
  "server:match:countdown",
  "server:match:started",
  "server:match:result",
  "server:error"
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

export type CloudflareServerMessage =
  | CloudflareAckEnvelope
  | CloudflareServerEventEnvelope;

export type CloudflareClientMessage = CloudflareRequestEnvelope;

export type CloudflareRequestPayload<TType extends CloudflareClientMessageType> = CloudflareClientCommandMap[TType]["request"];
export type CloudflareResponsePayload<TType extends CloudflareClientMessageType> = CloudflareClientCommandMap[TType]["response"];
export type CloudflareServerEventPayload<TType extends CloudflareServerEventType> = CloudflareServerEventMap[TType];