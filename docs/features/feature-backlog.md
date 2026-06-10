# Feature Backlog

機能実装へ進む時に GitHub Issues へ切り出す候補です。タイトルは Conventional Commits の scope にも使いやすい粒度にしています。

## P0 / Private Beta Stability

### settings / release

- [x] `feat(settings): wire sound playback to player settings`
  - sound effects と countdown sound を実際の再生処理に接続する。
  - sound off の時は再生しない。
- [ ] `feat(release): wire deployment provider and rollback`
  - hosting provider への自動 deploy と rollback をまとめる。
  - repo 内の Dockerfile / smoke test とつなぐ。
- [x] `feat(beta): add private beta feedback issue flow`
  - 不具合報告を GitHub Issue にすぐ切り出せるようにする。
  - 再現条件のテンプレートを用意する。
- [ ] `feat(repo): enable branch protection`
  - main への直接 push を避ける。
  - CI green を merge gate にする。

### persistence / session

- [x] `feat(db): add PostgreSQL persistence`
  - match result と基本的な session を永続化する。
  - private beta の再起動に備える。
- [x] `feat(identity): add guest session`
  - guest id と room code を session として扱いやすくする。
  - reload / reconnect の基盤を整理する。

## P1 / Better Play Experience

### prompt library

- `feat(prompt): add prompt validation`
  - 空、短すぎる、長すぎる、不正文字を拒否する。
  - disabled prompt を試合に出さない。
- `feat(prompt): avoid repeated prompts in a session`
  - 同じ session 内で直近 prompt を避ける。

### practice

- `feat(practice): add retry same prompt`
  - 同じ prompt を再挑戦できる。
  - retry と next prompt を分ける。
- `feat(practice): add session summary`
  - 連続試合の勝敗数を表示する。
  - round count と直近結果をまとめる。

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
