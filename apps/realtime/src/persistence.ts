import { Pool } from "pg";
import type { MatchResult, Prompt, PromptCategory, RoomState } from "@type-battle/shared";
import { logger } from "./logger.js";

type PersistenceStatus = {
  enabled: boolean;
  ready: boolean;
  lastError: string | undefined;
};

type GuestSessionRecord = {
  sessionId: string;
  guestId: string;
  nickname: string;
  roomCode?: string;
};

type MatchResultRecord = {
  roomCode: string;
  round: number;
  prompt: Prompt;
  promptCategory: PromptCategory;
  botDifficulty: RoomState["botDifficulty"];
  playerCount: number;
  hasBot: boolean;
  result: MatchResult;
};

const databaseUrl = process.env.DATABASE_URL?.trim();
const status: PersistenceStatus = {
  enabled: Boolean(databaseUrl),
  ready: false,
  lastError: undefined
};

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
let schemaPromise: Promise<void> | null = null;

const SCHEMA_SQL = `
  create table if not exists guest_sessions (
    session_id text primary key,
    guest_id text not null,
    nickname text not null,
    last_room_code text,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
  );

  create index if not exists guest_sessions_guest_id_idx on guest_sessions (guest_id);

  create table if not exists match_results (
    id bigserial primary key,
    room_code text not null,
    round integer not null,
    prompt_id text not null,
    prompt_text text not null,
    prompt_category text not null,
    bot_difficulty text not null,
    player_count integer not null,
    has_bot boolean not null,
    result jsonb not null,
    created_at timestamptz not null default now()
  );

  create index if not exists match_results_room_code_idx on match_results (room_code, created_at desc);
`;

export function getPersistenceStatus(): PersistenceStatus {
  return { ...status };
}

export async function recordGuestSession(input: GuestSessionRecord): Promise<void> {
  if (!pool) {
    return;
  }

  try {
    await ensureSchema();

    await pool.query(
      `
        insert into guest_sessions (session_id, guest_id, nickname, last_room_code, created_at, last_seen_at)
        values ($1, $2, $3, $4, now(), now())
        on conflict (session_id)
        do update set
          guest_id = excluded.guest_id,
          nickname = excluded.nickname,
          last_room_code = excluded.last_room_code,
          last_seen_at = now()
      `,
      [input.sessionId, input.guestId, input.nickname, input.roomCode ?? null]
    );

    status.ready = true;
    status.lastError = undefined;
  } catch (error) {
    status.ready = false;
    status.lastError = error instanceof Error ? error.message : String(error);
    logger.warn({
      event: "persistence_error",
      scope: "guest_session",
      error: status.lastError,
      sessionId: input.sessionId,
      guestId: input.guestId
    });
  }
}

export async function recordMatchResult(input: MatchResultRecord): Promise<void> {
  if (!pool) {
    return;
  }

  try {
    await ensureSchema();

    await pool.query(
      `
        insert into match_results (
          room_code,
          round,
          prompt_id,
          prompt_text,
          prompt_category,
          bot_difficulty,
          player_count,
          has_bot,
          result
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        input.roomCode,
        input.round,
        input.prompt.id,
        input.prompt.text,
        input.promptCategory,
        input.botDifficulty,
        input.playerCount,
        input.hasBot,
        JSON.stringify(input.result)
      ]
    );

    status.ready = true;
    status.lastError = undefined;
  } catch (error) {
    status.ready = false;
    status.lastError = error instanceof Error ? error.message : String(error);
    logger.warn({
      event: "persistence_error",
      scope: "match_result",
      error: status.lastError,
      roomCode: input.roomCode
    });
  }
}

async function ensureSchema(): Promise<void> {
  if (!pool) {
    return;
  }

  if (status.ready) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise = pool
      .query(SCHEMA_SQL)
      .then(() => {
        status.ready = true;
        status.lastError = undefined;
      })
      .catch((error: unknown) => {
        status.ready = false;
        status.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      })
      .finally(() => {
        schemaPromise = null;
      });
  }

  await schemaPromise;
}
