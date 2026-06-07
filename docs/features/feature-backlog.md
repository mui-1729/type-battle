# Feature Backlog

機能実装へ進む時に GitHub Issues へ切り出す候補です。タイトルは Conventional Commits の scope にも使いやすい粒度にしています。

## P0 / Private Beta Stability

### room lifecycle

- `feat(room): add room TTL and expiration cleanup`
  - waiting room、finished room、abandoned room を期限切れにする。
  - 期限切れ room へ join した時の error を定義する。
- `feat(room): add host leave handling`
  - host が抜けた時に host transfer または room close を行う。
  - lobby / match / result それぞれの挙動を決める。
- `feat(room): add rematch round state`
  - same room code で複数 round を扱う。
  - previous round の progress / result を次 round に混ぜない。

### disconnect / reconnect

- `feat(realtime): add reconnect grace period`
  - short disconnect では player slot を保持する。
  - grace を超えたら disconnected / forfeited にする。
- `feat(realtime): restore room state after reload`
  - guest id で同じ room に復帰する。
  - countdown / playing / result の各 state を復元する。
- `feat(match): settle long disconnect as forfeit`
  - playing 中の長期切断を敗北または未完走として扱う。
  - result に disconnect reason を残す。

### COM

- `feat(com): add difficulty selector`
  - Easy / Normal / Hard の速度とミス率を分ける。
  - COM の progress は server authoritative にする。
- `feat(com): add auto fallback when no opponent joins`
  - quick match や solo start で COM を自動投入する。
  - user が human only を選べる余地を残す。
- `feat(com): show COM profile in lobby and result`
  - COM 名、難易度、opponent type を表示する。
  - ranking / rating 対象外であることを結果に反映する。

## P1 / Better Play Experience

### prompt library

- `feat(prompt): add prompt categories`
  - Short / Standard / Long を選択できる。
  - server が prompt を選択する。
- `feat(prompt): add prompt validation`
  - 空、短すぎる、長すぎる、不正文字を拒否する。
  - disabled prompt を試合に出さない。
- `feat(prompt): avoid repeated prompts in a session`
  - 同じ session 内で直近 prompt を避ける。

### practice

- `feat(practice): add solo practice mode`
  - room を作らずに一人で開始できる。
  - result は match result と分離する。
- `feat(practice): add retry same prompt`
  - 同じ prompt を再挑戦できる。
  - retry と next prompt を分ける。

### result

- `feat(result): add detailed match stats`
  - max streak、finish gap、miss count を表示する。
  - 完走者と未完走者の両方に stats を出す。
- `feat(result): add session summary`
  - 連続試合の勝敗数を表示する。
  - round count と直近結果をまとめる。

### settings

- `feat(settings): persist player settings locally`
  - nickname、theme、sound、input guide を保存する。
  - reload 後も復元する。
- `feat(settings): add accessibility options`
  - reduced motion、font size、sound off を追加する。
  - match UI で layout が崩れない。

## P2 / Public Beta Readiness

### public lobby / matchmaking

- `feat(lobby): add public room list`
  - public room のみ一覧表示する。
  - full / playing / expired room を除外する。
- `feat(matchmaking): add quick match queue`
  - 条件に近い waiting player を match する。
  - timeout 後に COM fallback する。
- `feat(lobby): add public room visibility setting`
  - host が private / public を選べる。

### moderation

- `feat(moderation): add nickname filtering`
  - 長さ、禁止文字、HTML escape、NG word を扱う。
- `feat(report): add report opponent flow`
  - reason と room context を保存する。
  - report spam を rate limit する。
- `feat(block): avoid rematching blocked players`
  - current session で block した相手と再マッチしない。

### abuse prevention

- `feat(anti-cheat): flag suspicious high WPM`
  - threshold を超えた result に suspicious flag を付ける。
- `feat(anti-cheat): reject paste progression`
  - paste で progress が進まないようにする。
- `feat(rate-limit): throttle progress events`
  - player ごとの event spam を抑制する。

## P3 / Long-term Engagement

### identity / profile

- `feat(identity): stabilize guest id`
  - nickname 変更と guest id を分離する。
  - reconnect と report の基盤にする。
- `feat(profile): add optional player profile`
  - display name と basic stats を表示する。

### ranking / rating

- `feat(ranking): add weekly leaderboard`
  - rating 対象外 result を除外する。
  - mode 別に集計する。
- `feat(rating): add simple rating calculation`
  - COM、practice、suspicious result を除外する。

### social / event

- `feat(invite): add room invite link`
  - invite link から room join へ遷移する。
  - expired / full room の error を出す。
- `feat(spectator): add read-only spectator mode`
  - spectator は progress / finish event を送れない。
- `feat(tournament): add time attack event`
  - 最初の大会形式は bracket より time attack を優先候補にする。

## Issue 化のルール

- 1 issue は 1 feature または 1 acceptance criteria に近い粒度にする。
- 仕様 doc へのリンクを issue body の先頭に置く。
- 実装 issue には最低 1 つの test 観点を書く。
- Public beta 向け機能は moderation / rate limit / logging の前提を確認してから着手する。
