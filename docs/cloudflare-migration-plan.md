# Cloudflare Migration Plan

## 目的

`type-battle` の realtime を Cloudflare 前提の構成へ段階的に移行し、外部公開時に Node.js の realtime server を別途運用しなくてもよい状態を目指す。

この文書は issue #7 の成果物であり、issue #21 の担当分けと merge 順を前提にした移行計画として使う。

## 現状

現時点の repo は、Cloudflare 移行の「入口」はあるが、backend の本体はまだ Node/Socket.IO 側に残っている。

| 領域 | 現状 | 含意 |
| --- | --- | --- |
| Web UI | Next.js を Vercel 前提で運用 | web は当面そのまま維持できる |
| Realtime backend | `apps/realtime` の Node + Socket.IO server | Cloudflare 切替前の実動線 |
| Shared contract | `packages/shared/src/cloudflare-events.ts` がある | Web 側の transport 切替は既に契約化済み |
| Web adapter | `apps/web/app/_lib/realtime-client.ts` が `socketio` / `cloudflare` を切替 | UI 変更と transport 変更を分離しやすい |
| Cloudflare worker runtime | 最小 skeleton と room-state relay はある | wrangler 設定・deploy 導線・room authority の本格移植はこれから |

つまり、現状は「Cloudflare にすぐ切り替えられる」ではなく、「契約とフロント側の受け口はできていて、worker の最小 skeleton もあるので、backend 本体と deploy 導線を別 issue で積める」状態。

## 推奨目標構成

```txt
Browser
  |
  | HTTPS / WebSocket
  v
Next.js Web App on Vercel
  |
  | transport config
  v
Cloudflare Realtime Worker
  |
  | room authority / fanout / timers
  v
Durable Object per room
  |
  | room-local state / optional SQLite
  v
Persistent storage
```

### 推奨する責務分割

- Web は Vercel のまま維持する
- Realtime の接続先だけ Cloudflare に寄せる
- 1 room 1 Durable Object を基本単位にする
- room state、countdown、forfeit、rematch のような強整合が必要な処理を Durable Object に集約する
- match result や分析用の永続化は room state から切り離す

## なぜこの形か

- 既存の web は Vercel 前提で安定しているため、web の hosting まで同時に動かすとリスクが大きい
- issue #21 の分担でも、web integration と Cloudflare backend を分けている
- `apps/realtime/src/rooms.ts` の責務は大きく、そこへ Cloudflare 実装を重ねるより runtime を分けた方が衝突しにくい
- 1 room 1 Durable Object なら、タイピング対戦のような強整合ゲーム状態と相性がよい

## Free tier / beta リスク

Cloudflare の無料枠や beta 運用で特に意識する点は次の通り。

- Active room 数が増えると、Durable Object の実行回数と WebSocket 接続数がそのまま増える
- room ごとの強整合は DO に向くが、横断集計や検索は向かない
- 永続化を D1 や DO storage に寄せすぎると、対戦ログや分析の要求で後から詰まりやすい
- 逆に外部 PostgreSQL を realtime のホットパスにすると、Cloudflare 移行の旨味が薄れる
- Cloudflare で Redis 的な共有メモリを前提にすると、後で構成が複雑になる

設計上の原則は「room の局所状態は Cloudflare 内で完結、長期保存は別レイヤーに逃がす」。

具体的な request / message 見積もりは [docs/cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md) にまとめる。

## 段階的な移行

### Phase 1: 仕様と契約を固定する

- issue #7 で現行構成と移行後構成を文書化する
- issue #9 で event contract を固める
- web 側の adapter が Socket.IO と Cloudflare の両方を扱えることを維持する

### Phase 2: Cloudflare worker の骨格と deploy 導線を整える

- issue #8 で worker workspace と wrangler 設定・deploy 導線を固める
- local dev と deploy の最小導線を作る
- `Env` と binding を docs と実装の両方で同期する

### Phase 3: room engine と backend を移す

- issue #10 で runtime-neutral な room engine を切り出す
- issue #11 〜 #15 で Durable Object room lifecycle、timer、disconnect、COM、永続化を積む
- この段階では Node/Socket.IO 側の挙動を壊さない

### Phase 4: web を Cloudflare に接続する

- issue #16 〜 #19 で web adapter、E2E、cutover を進める
- issue #20 で旧 Socket.IO realtime server を片付ける

## 具体的な設計判断

### Web hosting

- 現時点では Vercel 維持を前提にする
- Cloudflare Pages への web 移行は、この issue 群のスコープ外に置く

### Storage

- room state の primary source は Durable Object に置く
- room-local な補助データが必要なら DO storage または SQLite を使う
- 取引履歴、集計、分析が必要なデータは別の永続層に分ける

### Persistence

- 既存の PostgreSQL 保存は、Cloudflare backend 移行時にそのまま hot path へ持ち込まない
- まずは realtime の authority を Cloudflare に移すことを優先し、長期保存の移植は別 issue に切る

### Observability

- room lifecycle、disconnect、forfeit、timers のログをまず残す
- free tier では、メトリクスよりも「どの room で何が起きたか」を追えることを優先する

## 失敗しやすい点

- room state を module-level variable に置いてしまう
- WebSocket の接続維持を worker ではなく外部サービスに逃がしすぎる
- D1 / DO storage に分析用途のデータを詰め込みすぎる
- web adapter と backend contract を別 issue で更新し、型の同期を崩す

## この計画での完了条件

- 現行構成と Cloudflare 目標構成の差分が説明できる
- issue ごとの依存関係と merge 順が追える
- free tier / beta の制約を踏まえて、どこまでを Cloudflare で完結させるか決められている
- 現在の web / realtime 実装と矛盾しない
- request / message の概算と follow-up issue が整理されている

## 関連

- issue #7
- issue #21
- [docs/architecture.md](architecture.md)
- [docs/current-implementation.md](current-implementation.md)
- [docs/features/deployment-private-beta.md](features/deployment-private-beta.md)
