# Type Battle

リアルタイム対戦タイピングゲームです。

Web は Next.js / React、Realtime backend は Cloudflare Worker / Durable Objects で構成しています。

## 現在の状態

MVP と Private Beta 向けの主要機能は `main` に実装済みです。

現在は新機能を増やすより、**Production deploy を再現可能にし、本番環境で Private Beta の受け入れ確認を完了すること**を優先しています。

### Private Beta 公開前の主要残件

1. **#167** Cloudflare 本番デプロイ用 Secrets / Variables を設定する
2. **#232** Production で Private Beta 受け入れ確認を行う
3. **#168** 実装済みの Preview 専用 Realtime 構成を外部環境へ deploy し、2 client で確認する

#193 の production dependency audit と #196 の Production CSP 制限は `main` に実装済みです。保守性改善の #197 / #198 は段階的に進行中です。

## 主な実装済み機能

### Online battle

- room code による 2 人対戦
- ready / countdown / match start
- server-authoritative typing validation
- realtime progress sync
- reload / reconnect
- long disconnect forfeit
- host migration
- rematch
- quick reaction

### Game rules

- Race
- Time Attack
- HP Battle

### COM / Practice

- COM 対戦
- easy / normal / hard
- Practice
- Daily Challenge
- mistake tendency visualization

### Result / settings

- WPM / accuracy / miss count
- finish gap / max streak
- theme / font size / reduced motion / input guide / sound
- cosmetic customization 基盤

### Safety / Public Beta foundation

- nickname の基本 moderation
- 対戦相手の report / local block 導線
- terms / privacy / contact pages
- Quick Match queue engine（完全な Quick Match #242 は進行中）

### Backend / operations

- Cloudflare Worker + room-scoped Durable Object
- Durable Object SQLite persistence
- guest session / match result retention
- structured logging
- rate limit / socket limits
- `/health` / `/ready` / `/metrics`
- GitHub Actions CI
- `main` branch protection
- Worker deploy workflow

実装状態の詳細は [docs/current-implementation.md](docs/current-implementation.md) を正本とします。

## Architecture

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
  v
RoomAuthorityDurableObject
  |
  v
Durable Object SQLite storage
```

client は typing input と sequence を送信し、server が prompt に対して入力を検証して progress / WPM / accuracy / result を確定します。

詳細は [docs/architecture.md](docs/architecture.md) を参照してください。

## Docs

まず次を参照してください。

- [docs/README.md](docs/README.md): ドキュメント目次と役割
- [docs/current-implementation.md](docs/current-implementation.md): **現在の実装状態の正本**
- [docs/roadmap.md](docs/roadmap.md): 今後の優先順位
- [docs/requirements.md](docs/requirements.md): 要件定義
- [docs/game-design.md](docs/game-design.md): ゲーム設計
- [docs/architecture.md](docs/architecture.md): アーキテクチャ
- [docs/quality-ci-cd.md](docs/quality-ci-cd.md): テスト / CI / CD / release gate
- [docs/github.md](docs/github.md): GitHub 運用
- [docs/features/README.md](docs/features/README.md): 機能仕様
- [docs/features/feature-backlog.md](docs/features/feature-backlog.md): Open Issue と今後の候補

## 開発

```bash
npm install
npm run dev
```

ローカルの基本チェック:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

CI の E2E では通常の desktop flow に加えて、mobile Chromium / WebKit の入力・viewport 回帰も確認します。

環境変数の雛形は [.env.example](.env.example) を参照してください。

## Cloudflare Worker

Realtime backend は `apps/cloudflare-worker` です。

```bash
npm run test --workspace @type-battle/cloudflare-worker
npm run typecheck --workspace @type-battle/cloudflare-worker
npm run dev --workspace @type-battle/cloudflare-worker
```

ローカルでは `.dev.vars.example` を参考に `ROOM_STATE_WRITE_TOKEN` を設定します。実値は commit しません。

Worker の Production deploy / rollback は [docs/features/deployment-private-beta.md](docs/features/deployment-private-beta.md) を参照してください。

## Local URLs

通常のローカル開発:

- Web: `http://127.0.0.1:3000`
- Worker: `http://127.0.0.1:8787`

同じ Wi-Fi の端末から確認する場合は、PC の LAN IP と firewall 設定を確認してください。

## 今後

Private Beta の公開確認後、Public Beta へ進む前に次を優先します。

- 実装済みの terms / privacy / contact と moderation / report / block の本番確認・運用整備
- anti-cheat / abuse monitoring
- Free tier の範囲に制限した load / cost baseline
- 完全な Quick Match #242 と public lobby

ranking、friends、spectator、完成版 Japanese typing、tournament などはその後の拡張として扱います。
