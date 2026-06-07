# Feature Specs

今後の機能実装に使う仕様置き場です。要件や設計を「実装タスクに落とせる粒度」でまとめます。

## 目的

- 実装前に振る舞い、イベント、受け入れ条件を揃える。
- MVP から private beta、public beta へ進む時に必要な機能を見失わない。
- GitHub Issues / PR にそのまま転記できる粒度にする。

## 機能別 docs

### 全体

- [feature-catalog.md](feature-catalog.md): 機能一覧、優先度、カテゴリ
- [feature-backlog.md](feature-backlog.md): GitHub Issues へ切り出す候補

### 対戦成立

- [com-opponent.md](com-opponent.md): COM 対戦、難易度、bot 挙動
- [matchmaking.md](matchmaking.md): 人がいない場合の bot fallback、将来のランダムマッチ
- [disconnect-reconnect.md](disconnect-reconnect.md): 切断、リロード、復帰、失格
- [room-lifecycle.md](room-lifecycle.md): room の作成、期限切れ、再戦、削除
- [rematch-session.md](rematch-session.md): 再戦、連続試合、session summary

### プレイ体験

- [prompt-library.md](prompt-library.md): 課題文、長さ、カテゴリ、難易度
- [practice-mode.md](practice-mode.md): 一人練習、retry、practice result
- [result-analytics.md](result-analytics.md): 結果分析、成績差分、接戦情報
- [player-settings.md](player-settings.md): nickname、theme、sound、表示設定
- [japanese-typing-mode.md](japanese-typing-mode.md): ローマ字入力、IME、日本語 prompt
- [spectator-mode.md](spectator-mode.md): 観戦、観戦者権限、配信向け表示

### 公開・コミュニティ

- [public-lobby.md](public-lobby.md): 公開 room 一覧、知らない人との入口
- [moderation-report.md](moderation-report.md): 通報、block、nickname 制御
- [anti-cheat-abuse.md](anti-cheat-abuse.md): 不正入力、event spam、suspicious flag
- [profiles-guest-identity.md](profiles-guest-identity.md): guest id、profile、将来の login
- [ranking-rating.md](ranking-rating.md): ranking、rating、戦績
- [friends-invites.md](friends-invites.md): invite link、friends、recent opponents
- [tournaments.md](tournaments.md): 大会、bracket、event 運営

### 運用

- [observability-rate-limit.md](observability-rate-limit.md): ログ、監視、rate limit
- [deployment-private-beta.md](deployment-private-beta.md): private beta デプロイ要件
- [notification-feedback.md](notification-feedback.md): お知らせ、障害 banner、feedback 導線

## 共通フォーマット

各仕様は次を含めます。

- 目的
- 対象ステージ
- ユーザー体験
- サーバー挙動
- UI 状態
- データ / イベント
- 受け入れ条件
- テスト観点
- 未決定事項

## 優先度

Private beta 前に優先する順序:

1. room lifecycle
2. disconnect / reconnect
3. observability / rate limit
4. deployment
5. COM difficulty
6. matchmaking
7. rematch / session flow
8. prompt library
9. result analytics
10. player settings

Public beta 前に優先する順序:

1. abuse monitoring
2. public lobby / random matchmaking
3. moderation
4. scaling with Redis
5. persisted match history
6. profiles / guest identity
7. ranking / rating
8. Japanese typing mode
9. spectator mode
10. feedback / notification
