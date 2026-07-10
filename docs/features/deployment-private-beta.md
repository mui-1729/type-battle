# Private Beta デプロイ仕様

## 目的

友人・知人に URL を共有して遊べる状態にする。Public beta ではなく private beta なので、スケールより「安定して試せる」「不具合を追える」を優先する。

## 対象ステージ

- Private Beta

## 推奨構成

```txt
Web App: Vercel
Realtime Backend: Cloudflare Worker
Persistence: Durable Object SQLite storage
Redis: optional until public matchmaking
```

MVP の web は Vercel に置く。realtime の active backend は Cloudflare Worker とし、旧 Node realtime server は運用対象から外す。
ローカル確認も Cloudflare Worker の E2E harness または `wrangler dev` を使う。

## 必須環境変数

### Web

```txt
NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=wss://cloudflare-realtime.example.com
NEXT_PUBLIC_FEEDBACK_ISSUE_URL=https://github.com/mui-1729/type-battle/issues/new?template=private-beta-feedback.yml
```

Web は Cloudflare realtime transport 固定です。`NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL` が未指定の local 環境では同一 host の `:8787` を既定の WebSocket endpoint として使います。

### Realtime

```txt
ROOM_STATE_WRITE_TOKEN=...
```

## Deploy Flow

1. `main` に merge
2. CI が lint / typecheck / test / build / E2E を通す
3. web を Vercel に deploy
4. Worker / shared contract を含む変更は `Deploy Cloudflare Worker` workflow を手動実行し、CI 成功済み commit SHA を指定する
5. GitHub production environment approval 後、workflow が Worker を deploy する
6. Preview / Production の URL を共有
7. `npm run test:e2e` で Cloudflare transport の browser flow を確認する

## Smoke Test

deploy 後に最低限確認する。

- Web URL が 200 を返す。
- Worker `/health` が 200 を返す。
- Worker `/ready` が 200 を返す。
- browser から Cloudflare WebSocket gateway に接続できる。
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
- Realtime / Worker: 直前の既知 commit SHA を `Deploy Cloudflare Worker` workflow に指定して再deployする。
- Durable Object storage schema が変わる場合は backward compatible にする。

外部 DB migration 導入前は rollback を単純化できる。

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
