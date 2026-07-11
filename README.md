# Type Battle

オンラインで 1 対 1 または複数人が同じ文章をタイピングして競う、リアルタイム対戦タイピングゲームの企画・設計リポジトリです。

## 現在の状態

このリポジトリは MVP の基本対戦に加えて、Private Beta に向けた機能を一部実装している段階です。Next.js の Web UI、Cloudflare Worker / Durable Object realtime backend、shared 型・スコア計算、CI、基本テストを追加しています。

当面の目標は、友人・知人など内輪で遊べるオンラインタイピング対戦ゲームを作ることです。将来的には Web に公開し、知らない人同士でも遊べるサービスに拡張できるようにします。

## 実装済み

- room code による 2 人対戦 room 作成・参加
- ロビーの参加者表示
- ホスト開始、3 秒カウントダウン
- タイピング進捗、WPM、正確率、ミスタイプ表示
- 完走結果と再戦
- 1 人で開始した場合の COM 対戦
- COM の server-side progress、速度揺らぎ、miss simulation
- COM difficulty selector
- リロード後の同一 guest room 復帰
- playing 中の長時間 disconnect forfeit 判定
- disconnect / forfeit の room state 反映
- waiting room TTL cleanup
- host leave 時の host transfer
- short / standard / long の prompt category
- host による prompt category 選択
- room code を維持した rematch
- practice prompt 発行 event
- result stats の `finishGap` と `maxStreak` field
- result analytics UI
- practice mode
- player settings modal / localStorage / theme / input guide / font size / reduced motion / sound wiring
- private beta feedback issue flow
- guest session
- Cloudflare Durable Object storage persistence
- structured logging
- room create / join / typing progress の軽い rate limit
- shared event types / game state / scoring
- Vitest unit / room flow tests
- Playwright room join / complete match / COM match / reload rejoin / long disconnect forfeit / player settings E2E
- GitHub Actions CI

実装済み・部分実装・未実装の詳しい状態は [docs/current-implementation.md](docs/current-implementation.md) にまとめています。

## Docs

- [docs/README.md](docs/README.md): ドキュメント目次
- [docs/research.md](docs/research.md): 技術調査メモ
- [docs/product-direction.md](docs/product-direction.md): プロダクト方針
- [docs/current-implementation.md](docs/current-implementation.md): 現在の実装状態
- [docs/requirements.md](docs/requirements.md): 要件定義
- [docs/game-design.md](docs/game-design.md): ゲーム設計
- [docs/architecture.md](docs/architecture.md): システム設計
- [docs/cloudflare-issue-tracker.md](docs/cloudflare-issue-tracker.md): Cloudflare realtime 移行 issue の担当・依存・merge 順
- [docs/features/README.md](docs/features/README.md): 機能別仕様
- [docs/features/feature-catalog.md](docs/features/feature-catalog.md): 今後作る機能の一覧と優先度
- [docs/features/feature-backlog.md](docs/features/feature-backlog.md): 実装 Issue 候補
- [docs/quality-ci-cd.md](docs/quality-ci-cd.md): Test / Build / CI / CD 規定
- [docs/github.md](docs/github.md): GitHub 連携・運用手順
- [docs/roadmap.md](docs/roadmap.md): 開発ロードマップ

## 推奨スタック

- Frontend: Next.js App Router + React + TypeScript
- Realtime backend: Cloudflare Worker + Durable Objects
- Persistence: Durable Object SQLite storage for room snapshots, guest sessions, and match results
- Cache / scaling: room-scoped Durable Objects or gateway sharding before public beta
- Testing: Vitest + Playwright
- Hosting: Vercel for web frontend, Cloudflare Worker for realtime backend

Next.js 単体で WebSocket 常時接続を完結させるより、Web UI と Cloudflare realtime backend を分ける構成を基本方針にします。理由は、対戦ルーム、切断復帰、スケールアウト、低遅延イベント処理を Durable Object 側で明確に管理できるためです。

## 開発

```bash
npm install
npm run dev
```

環境変数の雛形は [.env.example](.env.example) を参照してください。

### Cloudflare Worker

Realtime backend は `apps/cloudflare-worker` です。

```bash
npm run test --workspace @type-battle/cloudflare-worker
npm run typecheck --workspace @type-battle/cloudflare-worker
```

Worker は `/health` と Cloudflare WebSocket gateway を持ちます。WebSocket broadcast は shared の Cloudflare message contract に合わせて `server:room:state` を送ります。

`/rooms/:roomCode/state` は内部保守用の state import / read endpoint で、GET / PUT とも `ROOM_STATE_WRITE_TOKEN` が必要です。
通常の room create / join / match flow は `/rooms/:roomCode/socket` の WebSocket で処理します。

```bash
npm run dev --workspace @type-battle/cloudflare-worker
npm run deploy:dry-run --workspace @type-battle/cloudflare-worker
npm run deploy --workspace @type-battle/cloudflare-worker
```

`wrangler` は `@type-battle/cloudflare-worker` の workspace 依存として解決される前提です。
ローカル開発では example をコピーして `apps/cloudflare-worker/.dev.vars` に `ROOM_STATE_WRITE_TOKEN` を置いても動かせます。
`.dev.vars` と `.dev.vars.*` は Git 管理対象外です。実値は commit しないでください。

```bash
cp apps/cloudflare-worker/.dev.vars.example apps/cloudflare-worker/.dev.vars
npm exec --workspace @type-battle/cloudflare-worker -- wrangler secret put ROOM_STATE_WRITE_TOKEN
curl http://127.0.0.1:8787/health
```

ローカルでは次の URL を使います。

- Web: http://127.0.0.1:3000
- Realtime health: http://127.0.0.1:8787/health

同じ Wi-Fi の端末から試すときは、Web を開いた PC の LAN IP で `http://<PC の IP>:3000` にアクセスします。
realtime は同じ PC 上の `:8787` を使うので、PC 側のファイアウォールで 3000 / 8787 番ポートを許可する必要があります。

品質チェック:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Playwright のブラウザを入れた後、E2E を実行できます。

```bash
npx playwright install chromium
npm run test:e2e
```

## 次の作業

1. Cloudflare Worker deploy workflow の production secret / environment approval を設定する。
2. private beta の known issues を GitHub Issue と [docs/current-implementation.md](docs/current-implementation.md) に集約する。
3. public beta 向け機能の優先順位を決める。

機能実装前の詳細仕様は [docs/features/README.md](docs/features/README.md) にまとめています。
