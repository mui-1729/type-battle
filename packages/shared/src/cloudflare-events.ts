import type { CreateRoomPayload, JoinRoomPayload, ReadyPayload, RoomCodePayload } from "./events.js";
import type { AckResponse, BotDifficulty, MatchRule, PromptCategory, MatchResult, RoomState, TypingFinish, TypingProgress } from "./game-state.js";

export type CloudflareClientEventMap = {
  "client:room:create": CreateRoomPayload;
  "client:room:join": JoinRoomPayload;
  "client:room:leave": RoomCodePayload;
  "client:player:ready": ReadyPayload;
  "client:room:setPromptCategory": RoomCodePayload & { category: PromptCategory };
  "client:room:setBotDifficulty": RoomCodePayload & { difficulty: BotDifficulty };
  "client:room:setMatchRule": RoomCodePayload & { rule: MatchRule };
  "client:match:start": RoomCodePayload;
  "client:typing:progress": TypingProgress;
  "client:typing:finish": TypingFinish;
  "client:match:rematch": RoomCodePayload;
  "client:practice:start": { nickname: string; category: PromptCategory };
  "client:practice:dailyStart": { nickname: string };
};

export type CloudflareServerEventMap = {
  "server:room:state": RoomState;
  "server:player:progress": RoomState;
  "server:match:countdown": { room: RoomState; serverStartAt: number };
  "server:match:started": RoomState;
  "server:match:result": MatchResult;
  "server:error": { message: string };
};

export type CloudflareClientEventName = keyof CloudflareClientEventMap;
export type CloudflareServerEventName = keyof CloudflareServerEventMap;

export type CloudflareClientMessage = {
  [K in CloudflareClientEventName]: {
    id: string;
    type: K;
    payload: CloudflareClientEventMap[K];
  };
}[CloudflareClientEventName];

export type CloudflareServerEventMessage = {
  [K in CloudflareServerEventName]: {
    type: K;
    payload: CloudflareServerEventMap[K];
  };
}[CloudflareServerEventName];

export type CloudflareAckMessage = {
  type: "server:ack";
  id: string;
  response: AckResponse<unknown>;
};

export type CloudflareInboundMessage = CloudflareAckMessage | CloudflareServerEventMessage;
