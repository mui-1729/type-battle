# ロードマップ

## Phase 0: 準備

- [x] 技術調査
- [x] 要件定義
- [x] ゲーム設計
- [x] アーキテクチャ設計
- [x] GitHub 運用方針
- [x] GitHub remote 接続
- [x] プロダクト方針

## Phase 1: プロジェクト雛形

- [x] monorepo 構成を作る
- [x] Next.js + TypeScript を追加する
- [x] realtime server を追加する
- [x] shared types package を追加する
- [x] lint / format / typecheck を整える
- [x] npm scripts 規定を実装する

## Phase 2: MVP 対戦

- [x] Home 画面
- [x] room 作成
- [x] room 参加
- [x] Lobby 画面
- [x] countdown
- [x] Match 画面
- [x] progress sync
- [x] finish validation
- [x] Result 画面
- [x] COM 対戦

## Phase 3: 品質

- [x] scoring unit tests
- [x] room state unit tests
- [x] Socket.IO integration tests
- [x] 2 player typing completion Playwright E2E
- [x] COM match Playwright E2E
- [x] reload rejoin tests
- [ ] long disconnect handling tests
- [x] room join Playwright smoke E2E
- [x] GitHub Actions CI
- [x] local build check

## Phase 4: Private Beta

- [ ] room lifecycle / TTL
- [ ] long disconnect handling
- [ ] COM difficulty
- [ ] rematch / session flow
- [ ] prompt category and length selection
- [ ] result analytics
- [ ] player settings
- [ ] lightweight rate limit
- [ ] structured logging
- [ ] basic monitoring
- [ ] deployment
- [ ] CD smoke test
- [ ] private beta feedback issue flow
- [ ] branch protection
- [ ] PostgreSQL 保存
- [ ] guest session

## Phase 5: Public Beta

- [ ] Redis 導入
- [ ] quick match with COM fallback
- [ ] public lobby or random matchmaking
- [ ] nickname moderation
- [ ] report / block flow
- [ ] anti-cheat / suspicious result handling
- [ ] profiles / guest identity hardening
- [ ] weekly ranking / simple rating
- [ ] spectator mode
- [ ] Japanese typing mode prototype
- [ ] notification / feedback
- [ ] terms / privacy / contact page
- [ ] load testing
- [ ] abuse monitoring

## Phase 6: 拡張

- [ ] 3-8 player rooms
- [ ] authenticated users
- [ ] advanced ranking
- [ ] advanced rating
- [ ] friend matches
- [ ] invite links / friends
- [ ] tournaments
- [ ] replay
- [ ] chat or fixed reactions
