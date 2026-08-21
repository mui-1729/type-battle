# 機能バックログ

このファイルは「今後 Issue 化する候補」と「現在の主要 Open Issue」を整理するための一覧です。

実装済みかどうかの判断には [../current-implementation.md](../current-implementation.md) を使います。

## 現在の主要 Open Issue

### P0 / Private Beta 公開ゲート

- **#167 `chore(deploy): Cloudflare本番デプロイ用Secretsを設定する`**
  - Production deploy workflow を実際に使える状態にする
- **#232 `test(beta): 本番環境でPrivate Beta受け入れ確認を行う`**
  - Production で 2 人対戦・COM・reconnect・rematch・5〜10 試合連続プレイを確認する

### P1 / 開発・運用品質

- **#168 `chore(vercel): Preview用Realtime endpointを分離する`**
  - Preview Worker / Durable Object / Vercel 接続分離は `main` に実装済み
  - credentials 設定、Preview Worker の実デプロイ、2 client 確認が残る

### P2 / Security・保守性

- **#196** は Production CSP を Realtime origin へ限定する実装が `main` に merge 済み
- **#197 `refactor(web): page.tsxのRealtime・ゲーム状態管理を責務ごとに分割する`**
  - PR #224 / #226 で段階的に進行中
- **#198 `refactor(worker): room-authority.tsの対戦状態遷移と永続化責務を分割する`**
  - PR #227 で段階的に進行中

## すでに実装済みのため、新規 Issue を作らないもの

過去の backlog に残っていた次の項目は現在の `main` に実装済みです。

- branch protection
- prompt validation
- 直前 prompt の重複回避
- daily challenge
- mistake tendency visualization
- player settings / sound wiring
- Cloudflare persistence / retention
- guest session
- structured logging / basic monitoring
- Worker deploy workflow
- #193 production dependency audit gate
- #196 Production CSP restriction
- nickname の基本 moderation
- report / local block flow
- terms / privacy / contact pages
- Quick Match queue engine（完全な #242 は進行中）

同じ目的の Issue を重複して作らないようにします。

## Public Beta 向け Issue 候補

Public Beta へ進む段階で、次を 1 feature / 1 acceptance criteria に近い粒度で Issue 化します。

### 公開準備

- `test(legal): validate terms privacy and contact in production`
  - 実装済み pages の本番表示、リンク、問い合わせ運用を確認
- **#238** `test(load): define and run public beta load baseline`
  - Cloudflare Workers Free / Vercel Hobby のみを対象に、最大 20 rooms / 40 sockets で手動実行する
  - 自動 stress test は行わず、quota 監視、受付停止、rollback 条件を記録する
- `feat(monitoring): add abuse and service alerts`
  - error / connection / abuse の運用アラート

### Matchmaking / lobby

- **#242** `feat(matchmaking): complete quick match`
  - queue engine は実装済み。Gateway protocol、room bootstrap、Web UX、COM fallback、E2E が残る
- `feat(lobby): add public room list`
  - public room のみ表示し、full / playing / expired を除外
- `feat(lobby): add room visibility setting`
  - private / public の選択

### Moderation / abuse

基本 nickname filter、GitHub Issue への report 導線、local block、queue engine の block 照合は実装済みです。今後は辞書更新・審査・保存・制裁を運用要件として切り出します。

- `feat(moderation-ops): operate nickname and player reports`
  - report のサーバー側受付、retention、審査、解除、監査を定義
- `feat(anti-cheat): flag suspicious results`
  - 異常 WPM / automated input 等を suspicious として扱う

### Identity / ranking

- `feat(profile): add optional player profile`
- `feat(history): persist match history for users`
- `feat(ranking): add weekly leaderboard`
- `feat(rating): add simple rating`

ranking / rating は COM、Practice、suspicious result を対象外にできる設計を前提にします。

### Play experience

- `feat(japanese): complete Japanese typing mode`
  - 現在の kana / romaji 判定基盤から、IME / 表示 / E2E まで完成させる
- `feat(spectator): add read-only spectator mode`
- `feat(practice): add session summary`
- `feat(practice): add retry same prompt`

### Social / events

- `feat(invite): add room invite link`
- `feat(friends): add friend flow`
- `feat(tournament): add tournament or time attack event`
- `feat(replay): add match replay`

## Issue 化のルール

- 1 Issue は原則 1 つの目的にする
- Issue 本文の先頭に「状態 / 優先度」を置く
- 仕様がある場合は対象 docs をリンクする
- 実装 Issue には最低 1 つの test 観点を書く
- Open PR がある場合は Issue 本文に PR と残作業を明記する
- 実装済みの内容を別名で重複 Issue 化しない
- 「大きいファイルだから」だけでは refactor Issue を増やさず、変更リスクや責務の問題を具体化する
- Public Beta 向け機能は moderation / observability / load の前提を確認してから着手する
