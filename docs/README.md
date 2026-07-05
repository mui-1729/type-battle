# Docs

タイピング対戦オンラインゲームを作るための準備資料です。

## 目次

- [research.md](research.md): 調査結果と採用判断
- [product-direction.md](product-direction.md): 内輪向けから一般公開までのプロダクト方針
- [current-implementation.md](current-implementation.md): 現在の実装状態
- [requirements.md](requirements.md): MVP と将来要件
- [game-design.md](game-design.md): ルール、画面、ゲーム体験
- [architecture.md](architecture.md): 技術構成、データ、リアルタイム同期
- [cloudflare-migration-plan.md](cloudflare-migration-plan.md): Cloudflare realtime 移行の段階計画と free tier リスク
- [features/README.md](features/README.md): 機能別仕様
- [features/feature-catalog.md](features/feature-catalog.md): 今後作る機能の一覧と優先度
- [features/feature-backlog.md](features/feature-backlog.md): 実装 Issue 候補
- [quality-ci-cd.md](quality-ci-cd.md): Test / Build / CI / CD 規定
- [github.md](github.md): GitHub 連携、ブランチ、Issue、PR 運用
- [roadmap.md](roadmap.md): 段階的な開発計画

## 方針

最初の目標は、派手な機能よりも「2 人が同じ文章で対戦し、結果が正しく同期される」ことです。

公開方針は段階的にします。まずは内輪で遊べる private beta を目指し、安定性、ログ、最低限の安全対策が整ったら public beta を検討します。

MVP では次を優先します。

- ルーム作成と参加
- 同一文章でのカウントダウン開始
- タイピング進捗のリアルタイム同期
- WPM、正確率、順位の算出
- 試合終了と結果表示
- 切断時の最低限の復帰または敗北扱い

認証、ランキング、課金、フレンド、観戦、大会機能は MVP 後に追加します。

## 現在の実装状態

詳細は [current-implementation.md](current-implementation.md) にまとめる。

実装済み:

- room code による 2 人対戦
- COM 対戦
- COM difficulty selector
- reload rejoin
- waiting room TTL
- host transfer
- rematch
- prompt category
- long disconnect forfeit の server 判定
- long disconnect forfeit の room state 反映
- result stats の finish gap と max streak
- result analytics UI
- practice mode
- player settings modal / localStorage / theme / input guide / font size / reduced motion / sound wiring
- private beta feedback issue flow
- guest session
- PostgreSQL persistence
- structured logging
- room create / join / typing progress の軽量 rate limit
- smoke test script と realtime Dockerfile

部分実装:

- web deployment / Vercel wiring

## 次に仕様化・実装する機能

Private beta 前に優先する機能は次です。

1. web deployment / Vercel wiring
2. branch protection

Public beta 以降に検討する主な機能は次です。

- [public lobby](features/public-lobby.md)
- [moderation / report](features/moderation-report.md)
- [anti-cheat / abuse prevention](features/anti-cheat-abuse.md)
- [profiles / guest identity](features/profiles-guest-identity.md)
- [ranking / rating](features/ranking-rating.md)
- [Japanese typing mode](features/japanese-typing-mode.md)
- [spectator mode](features/spectator-mode.md)
- [friends / invites](features/friends-invites.md)
- [tournaments](features/tournaments.md)
- [notification / feedback](features/notification-feedback.md)
