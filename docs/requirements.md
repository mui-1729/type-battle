# 要件定義

## 目的

ユーザーがオンラインで同じ文章をタイピングし、速度・正確性・ゲームルールに応じた勝敗を競えるリアルタイム対戦ゲームを作ります。

当面は友人・知人へ URL を共有して遊べる Private Beta を安定させ、将来的に知らない人同士でも遊べる Public Beta へ拡張します。

現在の実装状況は [current-implementation.md](current-implementation.md) を正本とします。

## MVP 要件

### ユーザー体験

- ニックネームを設定できる
- room を作成できる
- room code で別プレイヤーが参加できる
- ready 後に host が試合を開始できる
- 1 人の場合は COM と対戦できる
- countdown 後に同じ課題文で対戦できる
- 相手の進捗を確認できる
- 試合終了後に結果を確認できる
- 同じ room で再戦できる

### リアルタイム同期

- room の参加・退出・接続状態を共有する
- countdown start time は server が決定する
- typing input は server へ送信する
- server が prompt に対して入力を検証し、進捗・WPM・accuracy・miss を更新する
- match result は server が確定する
- disconnect / reconnect を room state に反映する

### 非機能要件

- 1 room 2 人対戦を安定して扱える
- 重要な試合状態は server authoritative にする
- realtime payload は TypeScript 型で共有する
- 2 client 以上の E2E で基本フローを検証する
- guest id、room code、nickname の最低限の validation を行う
- 基本的な structured log を残す

MVP の主要要件は実装済みです。

## Private Beta 要件

友人・知人へ URL を共有して、継続的に遊べる段階です。

### 機能

- guest だけで参加できる
- room code を知っている人だけが参加できる
- COM と遊べる
- reload / short disconnect から復帰できる
- long disconnect の扱いが決まっている
- prompt category を選べる
- rematch できる
- practice が利用できる
- result に WPM / accuracy / miss / finish gap などを表示できる
- player settings が保存される

### 運用

- Web と Realtime backend を外部環境へデプロイできる
- CI で lint / typecheck / test / build / E2E を実行する
- `main` を PR + CI で保護する
- room / match lifecycle をログで追える
- room create / join / typing event に軽量 rate limit がある
- room / session / result が無期限に残り続けない
- deploy 後に health / readiness / WebSocket を確認できる
- 問題を GitHub Issue として報告できる

### 現在満たしているもの

上記の機能要件とコード側の運用基盤はほぼ実装済みです。詳細は [current-implementation.md](current-implementation.md) を参照してください。

### Private Beta 公開前の残件

- **#167** GitHub / Cloudflare に Production deploy 用 Secrets / Variables を設定する
- **#232** Production で 5〜10 試合を含む受け入れ確認を行う

#232 完了までは「Private Beta 向け機能は実装済み」でも「Private Beta 公開確認済み」とは扱いません。

### Private Beta の改善項目

公開の絶対条件とは分けて追跡します。

- **#168** Preview 専用 Realtime 構成は実装済み。外部 deploy / 2 client 確認が残る
- **#193** production dependency audit の CI 組み込みは実装済み
- **#196** CSP の接続先制限は実装済み
- **#197** Web の責務分割
- **#198** Worker の責務分割

## Public Beta 要件

知らない人にも利用してもらう段階です。

### 公開運用

- [x] 利用規約を用意する
- [x] プライバシー方針を用意する
- [x] 問い合わせ先を用意する
- サービス状態や重大障害を案内できる
- load / cost の目安を実測する
- error rate / connection / abuse を監視する

### Safety / moderation

- [x] nickname の長さ・禁止語・表示安全性の基本 filter を用意する
- [x] report / local block flow を用意する
- report のサーバー側保存・審査・制裁運用を整える
- event spam や不自然な入力を検知する
- suspicious result をランキング等から除外できる

### マッチメイキング

- [x] Quick Match queue engine を用意する
- Gateway / room bootstrap / Web UX / E2E を含む完全な Quick Match #242 を用意する
- public lobby を用意する場合は Quick Match と役割を分ける
- public / private room の境界を明確にする
- full / playing / expired room を誤って案内しない

### Identity / retention

- guest identity の寿命と保存範囲を明確にする
- 将来の authenticated user へ拡張できる
- match history を永続化する場合は retention / privacy を決める

## Public Beta 後の拡張候補

- authenticated profile
- ranking / rating
- friend / invite flow
- spectator mode
- 完成版 Japanese typing mode
- 3〜8 player rooms
- tournaments
- replay
- chat / fixed reactions の拡張

## 現在決まっている技術方針

- Web: Next.js / React / TypeScript
- Web hosting: Vercel
- Realtime: Cloudflare Worker
- room authority: room-scoped Durable Object
- persistence: Durable Object SQLite storage
- CI: GitHub Actions
- E2E: Playwright

Cloudflare Workers Free と Vercel Hobby のみを使用し、paid-only feature や従量課金を前提にしません。負荷確認は自動 stress test にせず、手動 harness を最大 20 rooms / 40 sockets に制限します。quota 枯渇前の監視・受付停止・rollback を先に定義し、外部サービス追加は無課金条件を満たす場合だけ別途判断します。

## 未決定事項

Private Beta を止める未決定事項はありません。

Public Beta 以降については、実利用データを見て次を決めます。

- Quick Match #242 完了後に public lobby も必要か
- authenticated account をいつ導入するか
- Japanese typing mode の入力仕様
- ranking / rating の方式
- 観戦・大会機能の優先度

## 機能別仕様

詳細は [features/README.md](features/README.md) に分けて管理します。仕様が存在していても実装済みとは限らないため、状態確認には [current-implementation.md](current-implementation.md) を使います。
