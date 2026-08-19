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
  - PR #220 で実装中
  - Preview Worker の実デプロイと 2 client 確認が残る
- **#193 `security(deps): 本番ビルドのhigh脆弱性を分類・解消し再発防止する`**
  - PR #221 で production dependency audit の CI 化を進める

### P2 / Security・保守性

- **#196 `security(web): ProductionのCSPを必要な接続先へ絞り込む`**
  - PR #219 で対応中
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

同じ目的の Issue を重複して作らないようにします。

## Public Beta 向け Issue 候補

Public Beta へ進む段階で、次を 1 feature / 1 acceptance criteria に近い粒度で Issue 化します。

### 公開準備

- `docs(legal): add terms privacy and contact pages`
  - 利用規約、プライバシー、問い合わせ先
- `test(load): define and run public beta load baseline`
  - simultaneous rooms / connections / typing events / cost を測定
- `feat(monitoring): add abuse and service alerts`
  - error / connection / abuse の運用アラート

### Matchmaking / lobby

- `feat(matchmaking): add quick match queue`
  - waiting player をマッチし、必要なら COM fallback
- `feat(lobby): add public room list`
  - public room のみ表示し、full / playing / expired を除外
- `feat(lobby): add room visibility setting`
  - private / public の選択

### Moderation / abuse

- `feat(moderation): add nickname filtering`
  - 長さ、禁止文字、NG word、表示安全性
- `feat(report): add report opponent flow`
  - reason と room context を保存
- `feat(block): avoid rematching blocked players`
  - block した相手を再マッチ対象から外す
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
