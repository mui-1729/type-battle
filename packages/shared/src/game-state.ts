export type MatchStatus = "waiting" | "countdown" | "playing" | "finished";

export type PlayerState = {
  id: string;
  nickname: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
  wpm: number;
  accuracy: number;
  finishedAt?: number;
  finishTimeMs?: number;
};

export type Prompt = {
  id: string;
  text: string;
};

export type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  status: MatchStatus;
  prompt?: Prompt;
  serverStartAt?: number;
  players: PlayerState[];
  maxPlayers: number;
  result?: MatchResult;
};

export type PlayerResult = PlayerState & {
  rank: number;
};

export type MatchResult = {
  roomCode: string;
  prompt: Prompt;
  players: PlayerResult[];
};

export type TypingProgress = {
  roomCode: string;
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
};

export type TypingFinish = TypingProgress;

export type AckResponse<T = unknown> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };
