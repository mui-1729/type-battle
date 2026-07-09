# アーキテクチャ

## 全体構成

```txt
Browser
  |
  | HTTPS
  v
Next.js Web App
  |
  | WebSocket
  v
Cloudflare Worker
  |
  | Durable Object bindings
  | - GATEWAY: practice / shared rate limit (RoomDurableObject, legacy gateway class name)
  | - ROOMS: room authority per room code (RoomAuthorityDurableObject)
  v
Durable Object SQLite storage
```

Web UI は Vercel / Next.js、realtime backend は Cloudflare Worker / Durable Object を active 構成にする。room authority、countdown、COM、forfeit、room snapshot、guest session、match result は Cloudflare 側で扱う。

`RoomDurableObject` は既存の `ROOMS.getByName("gateway")` storage を引き継ぐため、gateway class 名として維持する。新しい room scoped Durable Object は `RoomAuthorityDurableObject` として追加する。

Cloudflare 構成と free tier リスクの整理は [docs/cloudflare-migration-plan.md](cloudflare-migration-plan.md) と [docs/cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md) にまとめる。

## 推奨ディレクトリ構成

```txt
apps/
  web/
    app/
    components/
    lib/
  cloudflare-worker/
    src/
      realtime-gateway.ts
      room-authority.ts
      worker.ts
packages/
  shared/
    src/
      events.ts
      game-state.ts
      scoring.ts
docs/
```

## Cloudflare realtime message

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

- room state は Cloudflare Durable Object 内の room engine と storage snapshot で管理する。
- waiting room は TTL cleanup される。
- reload rejoin は localStorage の guest id / room code を使う。
- playing 中の long disconnect は server state で forfeit 判定できる。
- practice は Cloudflare command で prompt を発行し、UI も実装済み。
- Web 側は Cloudflare WebSocket adapter を使う。

## サーバー authoritative 方針

クライアントは「入力した」というイベントを送るだけにし、最終的な進捗・完走・勝敗はサーバーが確定する。

ただし、1 キーごとに完全検証すると通信量が増える。MVP では次の折衷にする。

- クライアントは currentIndex、correctCharacters、totalTypedCharacters、mistakes を送る。
- サーバーは room の prompt length と単調増加チェックを行う。
- finish event では currentIndex が prompt length に到達しているか検証する。
- 不自然な進捗ジャンプや高すぎる WPM を suspicious として記録する。

## スケール

### MVP

- Cloudflare Worker
- Durable Object room state
- guest id を発行
- room code 参加
- 基本ログ

### Private Beta

- Durable Object storage に guest session / match result 保存
- 軽い rate limit
- デプロイ環境
- エラー、切断、試合 lifecycle のログ
- 管理者だけがログを確認できる運用

### Public Beta

- room 単位 Durable Object または gateway sharding
- D1 / Analytics 用 storage の導入検討
- 公開ロビーまたはランダムマッチ
- 荒らし対策、禁止語、通報導線

### Production

- matchmaking queue を Durable Object / Queue / Redis などで管理
- replay / audit 用に match events を保存
- observability: logs, metrics, tracing
- バックアップ、障害対応、コスト監視

## セキュリティ

- room code は推測しにくい 6-8 文字にする。
- nickname は長さ制限、禁止文字、HTML escape を行う。
- Cloudflare WebSocket command で session id と guest id を確認する。
- rate limit を room creation、join、progress events に設定する。
- paste、tab switch、異常 WPM を検知する。

## テスト戦略

- Unit: scoring、progress validation、room state transition
- Integration: Cloudflare Worker / Durable Object gateway
- E2E: Playwright で 2 context を使った room 作成・参加・対戦・結果表示
- Load: k6 または autocannon で同時 room と progress events を確認

## Cloudflare 移行メモ

- shared の Cloudflare event contract、web adapter、Cloudflare Worker backend は実装済み。
- 旧 Node realtime server は削除済み。
- Web は現時点では Vercel 維持を前提にし、Cloudflare Pages への web 移行は別判断にする。
