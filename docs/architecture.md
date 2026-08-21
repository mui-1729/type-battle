# アーキテクチャ

## 全体構成

```txt
Browser
  |
  | HTTPS
  v
Next.js Web App (Vercel)
  |
  | WebSocket
  v
Cloudflare Worker
  |
  | Durable Object bindings
  | - GATEWAY: practice / gateway-level control
  | - ROOMS: room code ごとの room authority
  v
Durable Object SQLite storage
```

現在の active realtime backend は Cloudflare Worker / Durable Objects です。旧 Socket.IO realtime server は運用対象ではありません。

## 各コンポーネントの責務

### Web

- Home / Lobby / Match / Result / Practice UI
- local input の取得
- Realtime client の接続
- server state の表示
- localStorage を使う user settings / local analytics

最終的な進捗や勝敗は Web で確定しません。

### Cloudflare Worker

- WebSocket gateway
- command envelope / ack
- basic validation / rate limit
- room code に応じた Durable Object への routing
- health / readiness / metrics endpoint

### RoomAuthorityDurableObject

room code ごとの authoritative state を持ちます。

- join / leave / reconnect
- ready / countdown / match start
- typing validation
- `race` / `timeAttack` / `hpBattle` の状態遷移
- COM
- disconnect / forfeit
- rematch
- result 確定
- room snapshot の保存・復元
- guest session / match result persistence
- timer / alarm
- room-scoped broadcast

### Gateway Durable Object

既存 storage 互換と gateway-level の責務のために残しています。新しい room state の authority は room-scoped `RoomAuthorityDurableObject` です。

## Realtime contract

型定義の正本は `packages/shared/src/cloudflare-events.ts` です。

### Client command

```txt
client:room:create
client:room:join
client:room:leave
client:player:ready
client:player:reaction
client:player:equipment
client:room:setPromptCategory
client:room:setBotDifficulty
client:room:setMatchRule
client:match:start
client:typing:progress
client:typing:finish
client:match:rematch
client:practice:start
client:practice:dailyStart
```

### Server event

```txt
server:room:state
server:player:progress
server:match:countdown
server:match:started
server:match:result
server:error
server:player:reaction
```

command には request id を付け、server は `server:ack` で対応する request へ応答します。

## 主な共有 state

型定義の正本は `packages/shared/src/game-state.ts` です。

```ts
type MatchStatus = "waiting" | "countdown" | "playing" | "finished";
type MatchRule = "race" | "timeAttack" | "hpBattle";
type BotDifficulty = "easy" | "normal" | "hard";
type PromptCategory = "short" | "standard" | "long";
type TypingInputMode = "kana" | "romaji";
```

`RoomState` には match rule、prompt、server start / end time、players、round、result 等を持ちます。HP Battle 用 HP や typing 内部 state など、ルール・復旧に必要な値も shared state / persistence 側で扱います。

## Server-authoritative typing

現在は client が `currentIndex`、WPM、accuracy などの結果値を信用させる方式ではありません。

client が送る基本 payload は次です。

```ts
type TypingProgress = {
  roomCode: string;
  input: string;
  sequence: number;
};
```

server 側で:

1. player / room / match status を確認する
2. sequence の stale / duplicate を確認する
3. input を prompt に対して検証する
4. progress、correct count、total input、miss、streak を更新する
5. WPM / accuracy を計算する
6. ルール固有の状態遷移を行う
7. 終了条件を満たした場合だけ result を確定する

このため、client が forged progress や finish 値を送っても、その値をそのまま結果には使用しません。

## Persistence

Durable Object SQLite storage を使います。

保存対象:

- room snapshot
- player session / reconnect に必要な情報
- match result
- guest session
- timer / round 復元に必要な情報

期限切れ record は retention cleanup の対象です。

永続化の責務分割は #198 で段階的に進めています。

## Reconnect / lifecycle

- guest id と room code は Web の localStorage に保存
- disconnect 直後は room / player を即破棄しない
- short disconnect / reload では同じ player として復帰可能
- playing 中の long disconnect は server が forfeit 判定
- waiting / finished room は activity と connection 状態を考慮して TTL cleanup
- host 不在時は human player へ host を移譲

## Observability

Worker は次を持ちます。

- structured logging
- match terminal transition log
- `/health`
- `/ready`
- `/metrics`
- rate limit / socket limit / message size limit

Private Beta では「問題が起きた room / match の流れを追える」ことを重視します。

## Deployment

```txt
Web        -> Vercel
Realtime   -> Cloudflare Worker
Room state -> Durable Objects
CI         -> GitHub Actions
```

Worker は CI 成功済み commit SHA を指定する deploy workflow を持ちます。

2026-08-22 時点の運用上の残件:

- #167 Production 用 Cloudflare Secrets / Variables
- #232 Production 受け入れ確認
- #168 実装済み Preview 専用 Realtime 環境の実デプロイ・確認
- Production Worker は `ae61854` で `main` より 34 commits 遅れている
- Preview Worker は未デプロイ

## Security

### 実装済みの基盤

- server-authoritative typing validation
- identifier / payload validation
- room create / join / typing の軽量 rate limit
- socket / message size / idle 制限
- guest session
- retention cleanup
- branch protection / CI

### Public Beta 前に強化するもの

- nickname 基本 moderation、report / local block、terms / privacy / contact は実装済み
- report のサーバー側受付・審査運用
- suspicious result / automated input 対応
- load / abuse monitoring

Production CSP の Realtime origin 制限（#196）は実装済みです。

## Scaling

Redis を前提にはしません。

現在は room code ごとの Durable Object が state authority なので、まず次を実測します。

- simultaneous rooms
- WebSocket connections
- typing message rate
- Durable Object request / storage cost
- gateway bottleneck

Cloudflare Workers Free / Vercel Hobby のみを使い、paid-only feature は前提にしません。load harness は手動実行・最大 20 rooms / 40 sockets とし、quota 監視、受付停止、rollback を枯渇前に行います。別の storage / queue を検討する場合も、無課金条件と公式上限を再確認します。

## テスト戦略

- Unit: scoring、typing validation、pure helpers
- Integration: Worker / Durable Object / room protocol
- Runtime: persistence / restart recovery
- E2E: Playwright による 2 client、COM、reconnect、practice、mobile 等
- Production acceptance: #232
- Load: #238 で手動 harness を追加（自動 stress test なし、最大 20 rooms / 40 sockets）

## 保守上の課題

機能追加とは分けて次を進めています。

- #197 Web `page.tsx` の Realtime / game state 責務分割
- #198 Worker `room-authority.ts` の lifecycle / persistence 責務分割

大きさだけを理由に全面書き換えせず、挙動を維持しながら段階的に分離します。

## Cloudflare 移行資料

移行時の設計・Free Tier 監査は次に残しています。

- [cloudflare-migration-plan.md](cloudflare-migration-plan.md)
- [cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md)
- [cloudflare-issue-tracker.md](cloudflare-issue-tracker.md)

現在の構成についてはこのファイルを優先してください。
