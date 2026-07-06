# Private Beta デプロイ仕様

## 目的

友人・知人に URL を共有して遊べる状態にする。Public beta ではなく private beta なので、スケールより「安定して試せる」「不具合を追える」を優先する。

## 対象ステージ

- Private Beta

## 推奨構成

```txt
Web App: Vercel
Realtime Server: Node.js / Socket.IO now, Cloudflare Worker after #19
Cloudflare Worker: apps/cloudflare-worker
Database: PostgreSQL now, D1 or Durable Object storage for Cloudflare follow-up
Redis: optional until public matchmaking
```

MVP の web は Vercel に置く。Cloudflare Pages への web 移行は #18 で再評価するが、現時点では Vercel 維持を既定にする。

realtime server は現在 `apps/realtime` が active path。Cloudflare path は `apps/cloudflare-worker` の Worker / Durable Object skeleton から段階的に育て、#19 で default realtime transport を Cloudflare に切り替える。

## 必須環境変数

### Web

```txt
NEXT_PUBLIC_REALTIME_TRANSPORT=socketio
NEXT_PUBLIC_REALTIME_URL=https://realtime.example.com
NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=wss://type-battle-cloudflare-worker.<account>.workers.dev
NEXT_PUBLIC_FEEDBACK_ISSUE_URL=https://github.com/mui-1729/type-battle/issues/new?template=private-beta-feedback.yml
```

`NEXT_PUBLIC_REALTIME_TRANSPORT` は `socketio` と `cloudflare` を切り替えるフラグです。`socketio` の場合は `NEXT_PUBLIC_REALTIME_URL` を使い、`cloudflare` の場合は `NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL` を使います。未指定時は `socketio` を既定値として扱います。`NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL` は #19 の cutover 用で、現時点の private beta runbook ではまだ active backend に切り替えない前提です。

### Realtime

```txt
PORT=3001
CLIENT_ORIGIN=https://web.example.com
NODE_ENV=production
```

### Cloudflare Worker

```txt
ROOM_STATE_WRITE_TOKEN=...
```

`ROOM_STATE_WRITE_TOKEN` は `/rooms/:roomCode/state` の内部更新口だけで使う。client command を Worker が authoritative に処理するようになった後は、公開 API として扱わない。

Private beta 後:

```txt
DATABASE_URL=...
REDIS_URL=...
LOG_LEVEL=info
```

## Deploy Flow

1. `main` に merge
2. CI が lint / typecheck / test / build / E2E を通す
3. web を Vercel に deploy
4. Preview / Production の URL を共有
5. realtime 接続先が整った段階で smoke test を実行する

上の flow のうち、repo 内で明示しているのは web の Vercel 前提、Cloudflare Worker skeleton の deploy 手順、smoke test の手順まで。Cloudflare を active backend にする cutover は #19 で行う。

## Cloudflare Worker deploy

既存の Cloudflare project には触れず、`type-battle-cloudflare-worker` として独立した Worker を使う。

```bash
npm run dev --workspace @type-battle/cloudflare-worker
curl http://127.0.0.1:8787/health
```

deploy 前に dry run する。

```bash
npm run deploy:dry-run --workspace @type-battle/cloudflare-worker
```

secret を設定してから deploy する。

```bash
npm exec --workspace @type-battle/cloudflare-worker -- wrangler secret put ROOM_STATE_WRITE_TOKEN
npm run deploy --workspace @type-battle/cloudflare-worker
```

現時点では Worker が active backend ではないため、deploy 後の確認対象は `/health`、room socket upgrade、room-state relay までに限定する。create / join / match progression / COM / persistence は #12 から #15 と #17 の対象。`NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL` の実運用切替は #19 で行う。

## Frontend deploy

現時点の既定は Vercel 維持。

```bash
npm run build --workspace @type-battle/web
```

Cloudflare Pages に寄せる場合は #18 で別途 `apps/web` の build output、environment variables、preview / production branch の扱いを決める。

## Smoke Test

deploy 後に最低限確認する。

- Web URL が 200 を返す。
- Web から realtime 接続先へ到達できる。
- browser から socket 接続できる。
- room create ができる。
- room join ができる。
- COM match が開始できる。
- result が出る。

## Release Gate

Private beta 公開前に必要:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- deploy smoke test
- known issues を README または GitHub Issue に記録

## Rollback

初期は manual rollback でよい。

- Web: 前 deployment に戻す。
- Realtime: 前 image / release に戻す。
- DB migration がある場合は backward compatible にする。

DB migration 導入前は rollback を単純化できる。

## Private Beta Access Control

最初は secret URL 共有でよい。

次の段階で追加:

- Basic Auth
- invite code
- allowlist

Public beta 前には利用規約・プライバシー・問い合わせ導線を追加する。

## 受け入れ条件

- 共有 URL から Web が開く。
- Web から realtime に接続できる。
- 2 人対戦ができる。
- COM 対戦ができる。
- server restart 後も Web が再接続する。
- deploy 後 smoke test 手順が docs にある。

## 未決定事項

- web hosting provider は Vercel。
- private beta URL を public に見つかりにくくする方法。
- Redis を private beta 初期に入れるか。
