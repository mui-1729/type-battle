# 機能カタログ

Type Battle で扱う機能を、実装状況ではなく「どの公開段階で必要か」で整理します。

実装済みかどうかは [../current-implementation.md](../current-implementation.md) を参照してください。

## 優先度の考え方

- `P0`: Private Beta の公開・安定運用に必須
- `P1`: Private Beta の開発・運用品質を上げる
- `P2`: Public Beta で知らない人にも公開する前に必要
- `P3`: 継続利用・競技性・コミュニティ性を高める

## Private Beta の基盤

| 優先度 | 機能 | 目的 | 詳細 |
| --- | --- | --- | --- |
| P0 | Room lifecycle | room の作成・開始・終了・期限切れを安定させる | [room-lifecycle.md](room-lifecycle.md) |
| P0 | Disconnect / Reconnect | reload や短い切断で試合を壊さない | [disconnect-reconnect.md](disconnect-reconnect.md) |
| P0 | COM opponent | 人がいない時でも遊べるようにする | [com-opponent.md](com-opponent.md) |
| P0 | Observability / Rate limit | 障害調査と基本的な abuse 対策を可能にする | [observability-rate-limit.md](observability-rate-limit.md) |
| P0 | Private Beta deployment | 本番 deploy と rollback を再現可能にする | [deployment-private-beta.md](deployment-private-beta.md) |
| P1 | Rematch / Session flow | 同じ room で自然に再戦できるようにする | [rematch-session.md](rematch-session.md) |
| P1 | Prompt library | 課題文のカテゴリ・validation を管理する | [prompt-library.md](prompt-library.md) |
| P1 | Practice mode | 一人でも遊べるようにする | [practice-mode.md](practice-mode.md) |
| P1 | Result analytics | 結果から上達につながる情報を出す | [result-analytics.md](result-analytics.md) |
| P1 | Player settings | 表示・音・入力補助を調整できるようにする | [player-settings.md](player-settings.md) |

## Public Beta 前に必要な機能

| 優先度 | 機能 | 目的 | 詳細 |
| --- | --- | --- | --- |
| P2 | Public lobby / Matchmaking | 知らない人同士が対戦相手を見つける | [public-lobby.md](public-lobby.md) / [matchmaking.md](matchmaking.md) |
| P2 | Moderation / Report | 荒らし・名前・迷惑行為へ対応する | [moderation-report.md](moderation-report.md) |
| P2 | Abuse prevention | 不正入力・event spam・bot 的挙動を扱う | [anti-cheat-abuse.md](anti-cheat-abuse.md) |
| P2 | Notification / Feedback | 障害・運営情報・feedback の導線を持つ | [notification-feedback.md](notification-feedback.md) |
| P2 | Identity hardening | guest identity と保存範囲を整理する | [profiles-guest-identity.md](profiles-guest-identity.md) |

利用規約、プライバシー、問い合わせ、load test、abuse monitoring も Public Beta の公開条件として扱います。

## 継続利用・拡張

| 優先度 | 機能 | 目的 | 詳細 |
| --- | --- | --- | --- |
| P3 | Ranking / Rating | 継続的な競争を作る | [ranking-rating.md](ranking-rating.md) |
| P3 | Japanese typing mode | 日本語入力を正式なゲームモードとして完成させる | [japanese-typing-mode.md](japanese-typing-mode.md) |
| P3 | Spectator mode | 観戦・配信・イベントをしやすくする | [spectator-mode.md](spectator-mode.md) |
| P3 | Friends / Invites | 固定メンバーで遊びやすくする | [friends-invites.md](friends-invites.md) |
| P3 | Tournaments | 大会やイベント運営を可能にする | [tournaments.md](tournaments.md) |

## 当面作り込まないもの

少なくとも Private Beta では次を後回しにします。

- 課金
- 広告
- 高度な SNS 連携
- 音声チャット
- 大規模ランキングのリアルタイム集計
- 完全な e-sports 大会運営機能

## 技術選定の注意

Redis、D1、Queue など特定のスケール技術を機能要件そのものにはしません。

実測した同時接続数・message rate・cost をもとに、必要な時点で選びます。
