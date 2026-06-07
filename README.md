# Type Battle

オンラインで 1 対 1 または複数人が同じ文章をタイピングして競う、リアルタイム対戦タイピングゲームの企画・設計リポジトリです。

## 現在の状態

このリポジトリは実装前の準備段階です。まず、必要情報の調査、ゲーム仕様、技術構成、GitHub 運用方針を `docs/` にまとめています。

## Docs

- [docs/README.md](docs/README.md): ドキュメント目次
- [docs/research.md](docs/research.md): 技術調査メモ
- [docs/requirements.md](docs/requirements.md): 要件定義
- [docs/game-design.md](docs/game-design.md): ゲーム設計
- [docs/architecture.md](docs/architecture.md): システム設計
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

## 次の作業

1. GitHub リポジトリを作成し、このローカルディレクトリを remote に接続する。
2. Next.js + TypeScript の雛形を作る。
3. Socket.IO サーバーを追加し、ルーム作成と 2 人対戦の最小機能を実装する。
4. Playwright で 2 ブラウザ対戦の E2E テストを作る。
