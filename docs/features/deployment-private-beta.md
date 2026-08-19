# Private Beta デプロイ仕様

## 目的

友人・知人へ URL を共有し、実際の Production 環境で安定して遊べる状態にします。

Private Beta では大規模スケールより、次を優先します。

- deploy が再現可能
- Web と Realtime の version が追跡できる
- rollback できる
- 問題発生時に log を追える
- 主要フローを Production で確認できる

## 現在の構成

```txt
Web App: Vercel
Realtime Backend: Cloudflare Worker
Room authority: RoomAuthorityDurableObject
Persistence: Durable Object SQLite storage
CI: GitHub Actions
```

Redis は Private Beta の必須要件ではありません。

## 環境変数 / Secrets

### Web

```txt
NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL=...
NEXT_PUBLIC_FEEDBACK_ISSUE_URL=...
```

Production では Production Worker、Preview では Preview 専用 Worker を使い、環境を混在させません。

Preview の分離は #168 で追跡しています。

### Worker

```txt
ROOM_STATE_WRITE_TOKEN=...
```

### GitHub production Environment

Worker deploy workflow には次の設定が必要です。

```txt
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_WORKER_URL
```

実値は Issue、PR、repository file、workflow log に書きません。

この外部設定は #167 で追跡します。

## Production deploy flow

1. PR を `main` へ merge する
2. `main` の CI が成功する
3. Web は Vercel Git integration で Production deploy する
4. Worker / shared contract を含む変更では `Deploy Cloudflare Worker` workflow を実行する
5. CI 成功済み commit SHA を deploy 対象として指定する
6. GitHub production Environment の保護を通す
7. Worker deploy 後に health / WebSocket smoke を確認する
8. `/health.commitSha` と deploy 対象 commit が一致することを確認する
9. 必要に応じて #232 の Production acceptance を実施する

## Smoke test

最低限、次を確認します。

- Web が正常に表示される
- Worker `/health` が 200
- Worker `/ready` が 200
- browser から WebSocket 接続できる
- room create ができる
- room join ができる
- COM match が開始・終了できる
- result が表示される

Smoke test は短い死活確認であり、Private Beta の最終受け入れ試験そのものではありません。

## Private Beta acceptance

#232 で Production 環境の受け入れ確認を追跡します。

確認対象:

- 2 client room flow
- COM
- reload / reconnect
- long disconnect / forfeit
- rematch
- PC / smartphone
- 5〜10 試合の連続プレイ
- structured log で問題を追えること

#167 → #232 の順で完了した時点を、Private Beta 公開確認済みの基準とします。

## Release gate

Production 公開前:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

加えて:

- required CI が green
- known issue が記録されている
- Production Worker と Web の接続先が正しい
- Production secret が repository / log に露出していない
- Worker deploy が必要な変更では deploy 済み commit を確認する

## Rollback

### Web

Vercel の既知の正常 deployment へ戻します。

### Worker

直前の既知 commit SHA を `Deploy Cloudflare Worker` workflow に指定して再 deploy します。

### Storage

Durable Object storage schema を変更する場合は backward compatibility を優先します。

rollback 後の code が保存済み state を読めない変更を入れる場合は、migration / rollback plan を PR に明記します。

## Preview

Production Worker を Preview へ流用しません。

#168 で:

- Preview 用 Worker
- Preview 用 Durable Object storage
- Preview 用 Realtime endpoint
- Preview からの smoke / browser flow

を分離します。

## Access control

Private Beta 初期は URL を限定共有する運用で構いません。

必要性が出た場合に次を検討します。

- Basic Auth
- invite code
- allowlist

Public Beta 前には URL の秘匿性に依存せず、利用規約・プライバシー・問い合わせ・moderation を整えます。

## Secrets の原則

- API token は最小権限
- repository file に保存しない
- Issue / PR に値を書かない
- workflow log に出さない
- rotation 方法と管理者を決める
- local Wrangler OAuth credential を GitHub Secret の代用にしない

## 現在の残件

### P0

- #167 Production deploy Secrets / Variables
- #232 Production acceptance

### P1

- #168 Preview Realtime environment
- #193 production dependency audit gate

### P2

- #196 CSP hardening

機能開発とは別に、#197 / #198 の責務分割も進行しています。
