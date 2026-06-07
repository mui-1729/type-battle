# Docs

タイピング対戦オンラインゲームを作るための準備資料です。

## 目次

- [research.md](research.md): 調査結果と採用判断
- [product-direction.md](product-direction.md): 内輪向けから一般公開までのプロダクト方針
- [requirements.md](requirements.md): MVP と将来要件
- [game-design.md](game-design.md): ルール、画面、ゲーム体験
- [architecture.md](architecture.md): 技術構成、データ、リアルタイム同期
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

## 次に仕様化・実装する機能

Private beta 前に優先する機能は次です。

1. [room lifecycle](features/room-lifecycle.md)
2. [disconnect / reconnect](features/disconnect-reconnect.md)
3. [observability / rate limit](features/observability-rate-limit.md)
4. [private beta deployment](features/deployment-private-beta.md)
5. [COM difficulty](features/com-opponent.md)
6. [rematch / session flow](features/rematch-session.md)
7. [prompt library](features/prompt-library.md)
8. [result analytics](features/result-analytics.md)
9. [player settings](features/player-settings.md)

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
