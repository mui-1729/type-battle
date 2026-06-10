# Private Beta デプロイ仕様

## 目的

友人・知人に URL を共有して遊べる状態にする。Public beta ではなく private beta なので、スケールより「安定して試せる」「不具合を追える」を優先する。

## 対象ステージ

- Private Beta

## 推奨構成

```txt
Web App: Vercel
Realtime Server: Fly.io / Render / Railway / VPS
Database: PostgreSQL, optional at first
Redis: optional until public matchmaking
```

MVP の realtime server は WebSocket を維持する必要があるため、Vercel Functions だけで完結させない。
この repo には realtime server の `Dockerfile` と `tests/smoke-test.ts` があり、デプロイ前後の health / socket 確認はできる。

## 必須環境変数

### Web

```txt
NEXT_PUBLIC_REALTIME_URL=https://realtime.example.com
```

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
3. web を deploy
4. realtime を deploy
5. smoke test を実行
6. URL を共有

上の flow のうち、repo 内で用意しているのは build 物と smoke test までで、hosting provider への接続は外部設定として残る。

## Smoke Test

deploy 後に最低限確認する。

- Web URL が 200 を返す。
- Realtime `/health` が 200 を返す。
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

- realtime hosting provider。
- private beta URL を public に見つかりにくくする方法。
- Redis を private beta 初期に入れるか。
