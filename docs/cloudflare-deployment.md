# Cloudflare Deployment

## 方針

- Web frontend は Vercel に残す。
- Cloudflare Pages は private beta では使わない。
- Realtime backend は Cloudflare Worker を active backend とする。

## 必要な設定

### Web

```txt
NEXT_PUBLIC_REALTIME_TRANSPORT=cloudflare
NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=wss://<worker-host>
```

`NEXT_PUBLIC_REALTIME_URL` は Cloudflare path では使わない。

### Worker

```txt
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
ROOM_STATE_WRITE_TOKEN=...
```

`ROOM_STATE_WRITE_TOKEN` は `wrangler secret put ROOM_STATE_WRITE_TOKEN` で登録する。

## Worker deploy

`apps/cloudflare-worker/wrangler.toml` を使って deploy する。

```bash
cd apps/cloudflare-worker
npx wrangler deploy
```

必要なら tail でログを追う。

```bash
cd apps/cloudflare-worker
npx wrangler tail
```

## GitHub Actions

`/.github/workflows/deploy-cloudflare-worker.yml` は worker の deploy 用 workflow とする。

- `main` への push で worker deploy を実行する
- `workflow_dispatch` でも手動 deploy できる
- root build の後に worker deploy を実行する

## Smoke test

deploy 後は Cloudflare 版 E2E を実行する。

```bash
npm run test:e2e:cloudflare
```

## 関連

- [docs/features/deployment-private-beta.md](features/deployment-private-beta.md)
- [docs/cloudflare-migration-plan.md](cloudflare-migration-plan.md)
- [docs/cloudflare-free-tier-audit.md](cloudflare-free-tier-audit.md)
