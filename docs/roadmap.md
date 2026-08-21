# ロードマップ

このファイルは「これから何を進めるか」を管理します。

現在の実装状態は [current-implementation.md](current-implementation.md) を正本とし、ここでは完了済み機能の細かな棚卸しを重複させません。

## 現在地

- Local MVP: 完了
- 基本的な Private Beta 機能: 実装済み
- Private Beta の Production 運用確認: **残作業あり**
- Public Beta: safety / legal / queue engine の基盤は実装済み。完全な Quick Match #242 と運用準備は進行中

## Phase 0: 準備 — 完了

- [x] 技術調査
- [x] 要件定義
- [x] ゲーム設計
- [x] アーキテクチャ設計
- [x] GitHub 運用方針
- [x] プロダクト方針

## Phase 1: プロジェクト基盤 — 完了

- [x] monorepo
- [x] Next.js + TypeScript
- [x] shared package
- [x] Cloudflare Worker / Durable Objects
- [x] lint / typecheck / test / build
- [x] GitHub Actions CI
- [x] `main` branch protection

## Phase 2: 対戦 MVP — 完了

- [x] Home / Lobby / Match / Result
- [x] room 作成・参加
- [x] ready / countdown / match start
- [x] server-authoritative typing validation
- [x] progress sync / result
- [x] COM 対戦
- [x] reload / reconnect
- [x] disconnect forfeit
- [x] rematch

## Phase 3: プレイ体験 — 完了済みの基盤

- [x] prompt category
- [x] COM difficulty
- [x] practice mode
- [x] daily challenge
- [x] result analytics
- [x] player settings
- [x] sound wiring
- [x] quick reaction
- [x] cosmetics 基盤
- [x] `race` / `timeAttack` / `hpBattle`
- [x] mobile typing 対応

## Phase 4: Private Beta 公開準備 — 現在

### P0: 公開前に必須

- [ ] **#167** Cloudflare 本番デプロイ用 Secrets / Variables を設定する
- [ ] **#232** Production で Private Beta 受け入れ確認を行う

#232 では、本番構成で 2 人対戦・COM・reload / reconnect・forfeit・rematch と 5〜10 試合の連続プレイを確認します。

### P1: 開発・運用品質

- [x] **#168（実装）** Preview 用 Realtime endpoint / Worker / Durable Object を Production から分離する
- [ ] **#168（外部確認）** Preview Worker を実デプロイし、Vercel Preview から 2 client で確認する
- [x] **#193** production dependency audit を CI に組み込む

### P2: Defense in depth / 保守性

- [x] **#196** Production CSP の接続先を Realtime origin へ限定する
- [ ] **#197** Web の Realtime / game state 責務を分割する
- [ ] **#198** Worker の状態遷移 / persistence 責務を分割する

P2 は Private Beta の機能公開を不必要に止めない範囲で段階的に進めます。

## Phase 5: Public Beta 準備

知らない人同士が利用できる段階では、機能追加より先に公開運用上の安全性を整えます。

### 公開に必要

- [x] terms / privacy / contact pages
- [x] nickname の基本 moderation
- [x] report / local block flow
- [ ] legal / moderation / report の本番確認と運用整備
- [ ] anti-cheat / suspicious result handling
- [ ] abuse monitoring / alerting
- [ ] **#238** Free tier に制限した load baseline と容量目安（自動 stress test は行わない）

### 対戦相手を見つける機能

- [x] **#242 / #243 の一部** Quick Match queue engine
- [ ] **#242** Gateway / room bootstrap / Web UX / E2E を含む完全な Quick Match
- [ ] public lobby または random matchmaking
- [ ] public / private room visibility

### 継続利用

- [ ] profile / identity hardening
- [ ] persisted match history
- [ ] weekly ranking / simple rating
- [ ] notification / service status UI

## Phase 6: 拡張

- [ ] 完成版 Japanese typing mode
- [ ] spectator mode
- [ ] 3〜8 player rooms
- [ ] authenticated users
- [ ] advanced ranking / rating
- [ ] friend / invite flow
- [ ] tournaments
- [ ] replay
- [ ] chat または fixed reactions の拡張

## 技術選定について

Public Beta でスケール対策が必要になっても、Redis を前提条件にはしません。

Cloudflare Workers Free と Vercel Hobby の範囲だけを使います。まず 20 rooms / 40 sockets 以下の手動 load harness で room 分割、gateway、load / quota を確認し、上限到達前の監視・受付停止・rollback を整えます。paid-only feature、従量課金への自動移行、Redis 等を前提にしません。

## 優先順位のルール

1. Production を安全に再現可能な形で運用できること
2. 実際の利用で見つかった同期・入力・モバイル不具合
3. Security / observability
4. 回帰リスクを下げるリファクタ
5. Public Beta 向け新機能
6. 長期拡張

新しい Issue を追加するときは、既存 Issue や [features/feature-backlog.md](features/feature-backlog.md) と重複していないか確認します。
