# 機能仕様

機能ごとの振る舞い・受け入れ条件・テスト観点をまとめる場所です。

## 重要

ここに仕様ファイルが存在していても、その機能が実装済みとは限りません。

- 現在の実装状態: [../current-implementation.md](../current-implementation.md)
- 今後の順序: [../roadmap.md](../roadmap.md)
- 現在の主要 Issue / 候補: [feature-backlog.md](feature-backlog.md)

を参照してください。

## 目的

- 実装前に振る舞い・状態・イベント・受け入れ条件を揃える
- MVP → Private Beta → Public Beta の段階を混同しない
- GitHub Issue / PR に切り出せる粒度で設計する
- 実装後も回帰テストや仕様確認に使える形を保つ

## 機能別ドキュメント

### 全体

- [feature-catalog.md](feature-catalog.md): 機能一覧と公開段階
- [feature-backlog.md](feature-backlog.md): 現在の主要 Open Issue と今後の Issue 候補

### 対戦成立

- [com-opponent.md](com-opponent.md): COM 対戦
- [matchmaking.md](matchmaking.md): quick match / random matchmaking
- [disconnect-reconnect.md](disconnect-reconnect.md): 切断・再接続・失格
- [room-lifecycle.md](room-lifecycle.md): room lifecycle / TTL
- [rematch-session.md](rematch-session.md): 再戦・session flow

### プレイ体験

- [prompt-library.md](prompt-library.md): 課題文
- [practice-mode.md](practice-mode.md): Practice / retry
- [result-analytics.md](result-analytics.md): 結果分析
- [player-settings.md](player-settings.md): 設定
- [japanese-typing-mode.md](japanese-typing-mode.md): 日本語入力
- [spectator-mode.md](spectator-mode.md): 観戦

### 公開・コミュニティ

- [public-lobby.md](public-lobby.md): 公開 lobby
- [moderation-report.md](moderation-report.md): moderation / report / block
- [anti-cheat-abuse.md](anti-cheat-abuse.md): anti-cheat / abuse
- [profiles-guest-identity.md](profiles-guest-identity.md): identity / profile
- [ranking-rating.md](ranking-rating.md): ranking / rating
- [friends-invites.md](friends-invites.md): friends / invite
- [tournaments.md](tournaments.md): tournament

### 運用

- [observability-rate-limit.md](observability-rate-limit.md): observability / rate limit
- [deployment-private-beta.md](deployment-private-beta.md): Private Beta deploy
- [notification-feedback.md](notification-feedback.md): notification / feedback

## 現在の優先度

### Private Beta 公開前

新機能を増やすより、次を完了させます。

1. #167 Production deploy Secrets / Variables
2. #232 Production acceptance
3. #168 実装済み Preview Realtime environment の実デプロイ・2 client 確認

#193 dependency audit gate と #196 CSP restriction は `main` に実装済みです。

### Private Beta 中

実利用で見つかった同期・入力・モバイル不具合を優先します。

Security / refactor は #196 / #197 / #198 を段階的に進めます。

### Public Beta 前

1. 実装済み terms / privacy / contact と moderation / report / local block の本番確認・運用整備
2. anti-cheat / abuse monitoring
3. Free tier hard cap 内の load / cost baseline
4. 完全な Quick Match #242（queue engine は実装済み）/ public lobby
6. identity / match history
7. ranking / rating

### その後

- 完成版 Japanese typing mode
- spectator
- friends / invites
- authenticated users
- tournaments
- replay

## 共通フォーマット

新しい仕様は必要に応じて次を含めます。

- 目的
- 対象ステージ
- ユーザー体験
- state / server behavior
- UI state
- data / event
- acceptance criteria
- test 観点
- 未決定事項

実装済みの機能については「将来案」と「現在の仕様」が混ざらないように明記します。
