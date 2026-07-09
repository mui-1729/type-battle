export type MatchStatus = "waiting" | "countdown" | "playing" | "finished";

export type BotDifficulty = "easy" | "normal" | "hard";

export type MatchRule = "race" | "timeAttack" | "hpBattle";

export type DeviceKind = "mobile" | "desktop";

export type PlayerState = {
  id: string;
  nickname: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  isBot: boolean;
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
  deviceKind?: DeviceKind;
  hp?: number;
  maxHp?: number;
  maxStreak: number;
  currentStreak: number;
  wpm: number;
  accuracy: number;
  finishedAt?: number;
  finishTimeMs?: number;
  forfeited?: boolean | undefined;
};

export type PromptCategory = "short" | "standard" | "long";

export type PromptTyping = {
  romaji: string;
  hiragana: string;
};

export type Prompt = {
  id: string;
  text: string;
  category: PromptCategory;
  enabled?: boolean;
  typing: PromptTyping;
};

export type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  status: MatchStatus;
  matchRule: MatchRule;
  botDifficulty: BotDifficulty;
  promptCategory: PromptCategory;
  prompt?: Prompt;
  serverStartAt?: number;
  matchEndsAt?: number;
  players: PlayerState[];
  maxPlayers: number;
  result?: MatchResult;
};

export type PlayerResult = PlayerState & {
  rank: number;
  maxStreak: number;
  finishGap: number | undefined;
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
