# Type Battle

オンラインで 1 対 1 または複数人が同じ文章をタイピングして競う、リアルタイム対戦タイピングゲームの企画・設計リポジトリです。

## 現在の状態

このリポジトリは MVP 実装の初期段階です。Next.js の Web UI、Socket.IO の realtime server、shared 型・スコア計算、CI、基本テストを追加しています。

当面の目標は、友人・知人など内輪で遊べるオンラインタイピング対戦ゲームを作ることです。将来的には Web に公開し、知らない人同士でも遊べるサービスに拡張できるようにします。

## 実装済み

- room code による 2 人対戦 room 作成・参加
- ロビーの参加者表示
- ホスト開始、3 秒カウントダウン
- タイピング進捗、WPM、正確率、ミスタイプ表示
- 完走結果と再戦
- 1 人で開始した場合の COM 対戦
- リロード後の同一 guest room 復帰
- shared event types / game state / scoring
- Vitest unit / room flow tests
- Playwright room join / complete match / COM match / reload rejoin E2E
- GitHub Actions CI

## Docs

- [docs/README.md](docs/README.md): ドキュメント目次
- [docs/research.md](docs/research.md): 技術調査メモ
- [docs/product-direction.md](docs/product-direction.md): プロダクト方針
- [docs/requirements.md](docs/requirements.md): 要件定義
- [docs/game-design.md](docs/game-design.md): ゲーム設計
- [docs/architecture.md](docs/architecture.md): システム設計
- [docs/features/README.md](docs/features/README.md): 機能別仕様
- [docs/features/feature-catalog.md](docs/features/feature-catalog.md): 今後作る機能の一覧と優先度
- [docs/features/feature-backlog.md](docs/features/feature-backlog.md): 実装 Issue 候補
- [docs/quality-ci-cd.md](docs/quality-ci-cd.md): Test / Build / CI / CD 規定
- [docs/github.md](docs/github.md): GitHub 連携・運用手順
- [docs/roadmap.md](docs/roadmap.md): 開発ロードマップ

## 推奨スタック

- Frontend: Next.js App Router + React + TypeScript
- Realtime server: Node.js + Socket.IO
- Database: PostgreSQL
- Cache / scaling: Redis
- Testing: Vitest + Playwright
- Hosting: Vercel for web frontend, Fly.io / Render / Railway / VPS for realtime server

Next.js 単体で WebSocket 常時接続を完結させるより、Web UI とリアルタイムサーバーを分ける構成を基本方針にします。理由は、対戦ルーム、切断復帰、スケールアウト、低遅延イベント処理をサーバー側で明確に管理できるためです。

## 開発

```bash
npm install
npm run dev
```

ローカルでは次の URL を使います。

- Web: http://127.0.0.1:3000
- Realtime health: http://127.0.0.1:3001/health

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

1. COM の難易度選択を追加する。
2. 切断が長引いた場合の失格または試合継続ルールを固める。
3. Private beta 用のデプロイ先を決める。
4. ログ、rate limit、簡易 monitoring を追加する。
5. 再戦、課題文、結果分析、プレイヤー設定の仕様から実装順を決める。

機能実装前の詳細仕様は [docs/features/README.md](docs/features/README.md) にまとめています。
