import type {
  AckResponse,
  MatchResult,
  RoomState,
  TypingFinish,
  TypingProgress
} from "./game-state.js";

export type JoinRoomPayload = {
  roomCode: string;
  nickname: string;
  guestId: string;
};

export type CreateRoomPayload = {
  nickname: string;
  guestId: string;
};

export type RoomCodePayload = {
  roomCode: string;
};

export type ReadyPayload = RoomCodePayload & {
  ready: boolean;
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
};

export type ServerToClientEvents = {
  "room:state": (room: RoomState) => void;
  "player:progress": (room: RoomState) => void;
  "match:countdown": (payload: { room: RoomState; serverStartAt: number }) => void;
  "match:started": (room: RoomState) => void;
  "match:result": (result: MatchResult) => void;
  "match:error": (payload: { message: string }) => void;
};
