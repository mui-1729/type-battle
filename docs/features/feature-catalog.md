# Feature Catalog

オンラインタイピング対戦ゲームとして検討する機能の一覧です。詳細仕様へ落とす前の棚卸しとして使います。

## 優先度の考え方

- `P0`: Private beta で安定して遊ぶために必要。
- `P1`: 内輪利用の満足度を上げ、Public beta の土台になる。
- `P2`: Public beta で知らない人同士が遊ぶ時に必要。
- `P3`: 継続利用、競技性、コミュニティ性を高める。

## 対戦成立

| 優先度 | 機能 | 目的 | 詳細 |
| --- | --- | --- | --- |
| P0 | Room lifecycle | room の作成、開始、終了、期限切れを安定させる | [room-lifecycle.md](room-lifecycle.md) |
| P0 | Disconnect / Reconnect | reload や短い切断で試合を壊さない | [disconnect-reconnect.md](disconnect-reconnect.md) |
| P0 | COM opponent | 人がいない時でも遊べるようにする | [com-opponent.md](com-opponent.md) |
| P1 | Matchmaking | quick match と bot fallback を整理する | [matchmaking.md](matchmaking.md) |
| P1 | Rematch / Session flow | 1 試合後に自然に再戦できるようにする | [rematch-session.md](rematch-session.md) |

## プレイ体験

| 優先度 | 機能 | 目的 | 詳細 |
| --- | --- | --- | --- |
| P1 | Prompt library | 課題文の難易度、カテゴリ、長さを管理する | [prompt-library.md](prompt-library.md) |
| P1 | Practice mode | 対戦前に一人で練習できるようにする | [practice-mode.md](practice-mode.md) |
| P1 | Result analytics | 結果画面で上達につながる情報を出す | [result-analytics.md](result-analytics.md) |
| P1 | Player settings | 入力表示、音、テーマなどを調整できるようにする | [player-settings.md](player-settings.md) |
| P2 | Japanese typing mode | ローマ字入力や IME の差を考慮した日本語モードを作る | [japanese-typing-mode.md](japanese-typing-mode.md) |
| P2 | Spectator mode | 観戦、配信、内輪イベントをしやすくする | [spectator-mode.md](spectator-mode.md) |

## 公開・コミュニティ

| 優先度 | 機能 | 目的 | 詳細 |
| --- | --- | --- | --- |
| P2 | Public lobby | 知らない人同士が room を見つけられるようにする | [public-lobby.md](public-lobby.md) |
| P2 | Moderation / Report | 荒らし、名前、迷惑行為に対応する | [moderation-report.md](moderation-report.md) |
| P2 | Abuse prevention | 不正入力、過剰アクセス、bot 的挙動を検知する | [anti-cheat-abuse.md](anti-cheat-abuse.md) |
| P3 | Profiles / Guest identity | guest からログインへ自然に拡張する | [profiles-guest-identity.md](profiles-guest-identity.md) |
| P3 | Ranking / Rating | 継続的な競争と実力の近い対戦を作る | [ranking-rating.md](ranking-rating.md) |
| P3 | Friends / Invites | 固定メンバーで遊びやすくする | [friends-invites.md](friends-invites.md) |
| P3 | Tournaments | 大会やイベント運営を可能にする | [tournaments.md](tournaments.md) |

## 運用

| 優先度 | 機能 | 目的 | 詳細 |
| --- | --- | --- | --- |
| P0 | Observability / Rate limit | 障害調査と軽い abuse 対策を可能にする | [observability-rate-limit.md](observability-rate-limit.md) |
| P0 | Private beta deployment | 内輪向け URL 公開と rollback を整える | [deployment-private-beta.md](deployment-private-beta.md) |
| P2 | Notification / Feedback | 不具合報告や運営告知の導線を作る | [notification-feedback.md](notification-feedback.md) |

## 作らない機能

少なくとも MVP / Private beta では次を後回しにします。

- 課金
- 広告
- 高度な SNS 連携
- 音声チャット
- 完全な e-sports 大会運営機能
- 大規模ランキングのリアルタイム集計
