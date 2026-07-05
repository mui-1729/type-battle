# Private Beta デプロイ仕様

## 目的

友人・知人に URL を共有して遊べる状態にする。Public beta ではなく private beta なので、スケールより「安定して試せる」「不具合を追える」を優先する。

## 対象ステージ

- Private Beta

## 推奨構成

```txt
Web App: Vercel
Realtime Server: local / self-hosted / later
Database: PostgreSQL, optional at first
Redis: optional until public matchmaking
```

MVP の web は Vercel に置く。realtime server はこの段階では外部デプロイしない。
この repo には realtime server の `Dockerfile` と `tests/smoke-test.ts` があり、ローカル / self-hosted 前提の確認はできる。

## 必須環境変数

### Web

```txt
NEXT_PUBLIC_REALTIME_TRANSPORT=socketio
NEXT_PUBLIC_REALTIME_URL=https://realtime.example.com
NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=wss://cloudflare-realtime.example.com
NEXT_PUBLIC_FEEDBACK_ISSUE_URL=https://github.com/mui-1729/type-battle/issues/new?template=private-beta-feedback.yml
```

`NEXT_PUBLIC_REALTIME_TRANSPORT` は `socketio` と `cloudflare` を切り替えるフラグです。`socketio` の場合は `NEXT_PUBLIC_REALTIME_URL` を使い、`cloudflare` の場合は `NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL` を使います。未指定時は `socketio` を既定値として扱います。

### Realtime

```txt
PORT=3001
CLIENT_ORIGIN=https://web.example.com
NODE_ENV=production
```

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

上の flow のうち、repo 内で明示しているのは web の Vercel 前提と smoke test の手順までで、realtime の公開 deploy は別途決める。

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
