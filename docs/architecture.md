# アーキテクチャ

## 全体構成

```txt
Browser
  |
  | HTTPS
  v
Next.js Web App
  |
  | REST API / session
  v
API Server / Database

Browser
  |
  | Socket.IO
  v
Realtime Game Server
  |
  | room state / pubsub
  v
Redis
  |
  | persisted match data
  v
PostgreSQL
```

MVP では Next.js と Socket.IO server を同じ Node.js プロジェクト内で管理してもよい。ただし内輪向け private beta から public beta へ広げる可能性があるため、Web UI と realtime server は分離可能な構成にする。

Cloudflare 移行の目標構成と free tier リスクの整理は [docs/cloudflare-migration-plan.md](cloudflare-migration-plan.md) にまとめる。

## 推奨ディレクトリ構成

```txt
apps/
  web/
    app/
    components/
    lib/
  realtime/
    src/
      events/
      game/
      rooms/
packages/
  shared/
    src/
      events.ts
      game-state.ts
      scoring.ts
docs/
```

## Socket.IO イベント案

### Client to Server

- `room:create`
- `room:join`
- `room:leave`
- `player:ready`
- `room:setPromptCategory`
- `match:start`
- `typing:progress`
- `typing:finish`
- `match:rematch`
- `practice:start`

### Server to Client

- `room:state`
- `match:countdown`
- `match:started`
- `player:progress`
- `match:result`
- `match:error`

## Game State

```ts
type MatchStatus =
  | "waiting"
  | "countdown"
  | "playing"
  | "finished";

type BotDifficulty = "easy" | "normal" | "hard";

type PromptCategory = "short" | "standard" | "long";

type PlayerState = {
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
  wpm: number;
  accuracy: number;
  finishedAt?: number;
  finishTimeMs?: number;
};

type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  status: MatchStatus;
  botDifficulty: BotDifficulty;
  promptCategory: PromptCategory;
  prompt?: Prompt;
  serverStartAt?: number;
  players: PlayerState[];
  maxPlayers: number;
  result?: MatchResult;
};
```

## 現在の実装メモ

- room state は realtime server の in-memory Map で管理する。
- waiting room は TTL cleanup される。
- reload rejoin は localStorage の guest id / room code を使う。
- playing 中の long disconnect は server state で forfeit 判定できる。
- practice は server event だけ先に実装してあり、UI は未実装。
- Web 側には Cloudflare realtime の transport contract と adapter があるが、backend 本体はまだ `apps/realtime` の Node/Socket.IO server のまま。

## サーバー authoritative 方針

クライアントは「入力した」というイベントを送るだけにし、最終的な進捗・完走・勝敗はサーバーが確定する。

ただし、1 キーごとに完全検証すると通信量が増える。MVP では次の折衷にする。

- クライアントは currentIndex、correctCharacters、totalTypedCharacters、mistakes を送る。
- サーバーは room の prompt length と単調増加チェックを行う。
- finish event では currentIndex が prompt length に到達しているか検証する。
- 不自然な進捗ジャンプや高すぎる WPM を suspicious として記録する。

## スケール

### MVP

- 単一 realtime server
- in-memory room state
- guest id を発行
- room code 参加
- 基本ログ

### Private Beta

- PostgreSQL に試合結果保存
- 軽い rate limit
- デプロイ環境
- エラー、切断、試合 lifecycle のログ
- 管理者だけがログを確認できる運用

### Public Beta

- Redis に room state の一部を保存
- Socket.IO Redis Adapter を導入
- 複数 realtime server
- 公開ロビーまたはランダムマッチ
- 荒らし対策、禁止語、通報導線

### Production

- matchmaking queue を Redis で管理
- replay / audit 用に match events を保存
- observability: logs, metrics, tracing
- バックアップ、障害対応、コスト監視

## セキュリティ

- room code は推測しにくい 6-8 文字にする。
- nickname は長さ制限、禁止文字、HTML escape を行う。
- Socket.IO handshake で session または guest token を確認する。
- rate limit を room creation、join、progress events に設定する。
- paste、tab switch、異常 WPM を検知する。

## テスト戦略

- Unit: scoring、progress validation、room state transition
- Integration: Socket.IO event handler
- E2E: Playwright で 2 context を使った room 作成・参加・対戦・結果表示
- Load: k6 または autocannon で同時 room と progress events を確認

## Cloudflare 移行メモ

- 既に shared の Cloudflare event contract と web の transport adapter はあるため、次の実装は backend 側の room authority の移植に集中できる。
- `apps/cloudflare-worker/*` は未作成なので、worker skeleton と wrangler 設定が最初の実装対象になる。
- Web は現時点では Vercel 維持を前提にし、Cloudflare Pages への web 移行は別判断にする。
