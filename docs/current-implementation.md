# 現在の実装状態

2026-08-20 時点の `main` で「実際に何が動くか」をまとめた正本です。

Open PR の変更は、merge されるまで実装済みには含めません。

## 実装済み

### 対戦の基本フロー

- room code による room 作成・参加
- 1 room 2 人までの human 対戦
- ready 状態と host による match start
- 1 人 room からの COM 対戦開始
- server start time を使った countdown
- server authoritative な進捗・結果確定
- Result 画面で順位、WPM、accuracy、miss count、finish gap、max streak を表示
- room code を維持した rematch

### 対戦ルール

現在の shared state では次の 3 ルールを扱います。

- `race`: 先に完走したプレイヤーが勝つ
- `timeAttack`: 制限時間内の進捗で競う
- `hpBattle`: typing に応じて HP を削り合う

ルールごとの画面・終了条件・結果表示が Web / Worker 側に実装されています。

### タイピング入力と検証

- client は入力文字列と sequence を送信する
- server が prompt と照合し、進捗・正解数・入力数・miss・WPM・accuracy を更新する
- client が送った forged progress / finish 値を結果確定に使用しない
- stale / duplicate sequence を考慮した入力処理
- `romaji` / `kana` の入力モード判定基盤
- prompt の空文字や制御文字などの validation

完全な日本語タイピングモードとしての UX・IME 仕様はまだ完成扱いにしません。

### COM 対戦

- `easy | normal | hard` の難易度選択
- server 側で COM player を room state に追加
- server timer による COM progress
- 難易度に応じた速度と miss の揺らぎ
- human host を維持する host migration

### Room lifecycle / reconnect

- activity 基準の waiting / finished room TTL
- disconnect 直後に room を破棄しない reload rejoin
- guest id と room code の localStorage 保存
- reconnect 時の同一 player identity 復元
- disconnect 状態の room state 反映
- playing 中の長時間 disconnect に対する server-side forfeit
- forfeit 後の room state / result 反映
- host leave / disconnect 時の human host 移譲
- rematch 時の round state / progress / result / timer reset

### Prompt

- shared package の static prompt list
- `short | standard | long` の category
- lobby で host が category を選択
- match start 時に server が category に応じて prompt を選択
- 無効な prompt の validation
- session 内で直前と同じ prompt をできるだけ避ける処理

### 練習・デイリーチャレンジ

- Practice の入口、typing UI、result UI
- `practice:start` による server 側 prompt 発行
- Practice again
- Asia/Tokyo の日付境界で切り替わる daily challenge
- daily challenge の当日ベストを localStorage に保存
- miss tendency の localStorage 蓄積と可視化

### UI / 設定 / カスタマイズ

- nickname、theme、input guide、font size、reduced motion、sound 設定
- settings modal と localStorage 保存 / 復元
- system / light / dark theme
- sound / countdown sound の再生制御
- quick reaction
- 棒人間ベースの battle UI
- head accessory / held item などの cosmetic 表示・選択基盤
- mobile typing UI と iOS / WebKit 向け viewport 対応

### Session / persistence

- guest session
- room-scoped `RoomAuthorityDurableObject`
- Durable Object SQLite storage への room snapshot 保存・復元
- guest session / match result の保存
- retention cleanup

### Observability / 保護

- structured logging
- match terminal transition の構造化ログ
- room create / join / typing progress の軽量 rate limit
- IP / guest id / socket 単位の制限
- WebSocket message size、identifier、room socket 数、未参加 socket idle timeout の上限
- `/health`
- `/ready`
- `/metrics`

### Test / CI

- GitHub Actions CI
- lint
- typecheck
- unit / integration test
- build
- Playwright E2E
- room join / 2 player completion / COM / reload rejoin / long disconnect / practice / settings / mobile typing などの E2E
- Cloudflare Worker / Durable Object の integration / runtime test

### Deployment

- Web: Vercel
- Realtime: Cloudflare Worker + Durable Objects
- Vercel Git integration
- Cloudflare Worker の手動 deploy workflow
- CI 成功済み commit SHA を指定する production deploy 経路
- deploy 後 health / WebSocket smoke の仕組み
- `main` branch protection

## 外部設定・運用確認が残っているもの

コードではなく GitHub / Cloudflare / Vercel 側の設定や Production 確認が必要です。

### P0

- **#167** Cloudflare 本番デプロイ用 Secrets / Variables の設定
- **#232** Production での Private Beta 受け入れ確認

### P1

- **#168** Preview 専用 Realtime endpoint の実デプロイ・結合確認
- **#193** production dependency audit の CI 組み込み

### P2

- **#196** Production CSP の接続先制限

## 進行中のリファクタ

現在の機能を変えず、責務分割を進めています。

- **#197** Web `page.tsx` の Realtime / game state 責務分割
  - PR #224: connection lifecycle
  - PR #226: socket event state 適用
- **#198** Worker `room-authority.ts` の状態遷移 / persistence 責務分割
  - PR #227: persistence snapshot 生成

## Public Beta 以降の未実装・未完成領域

- public lobby / random matchmaking
- nickname moderation
- report / block
- anti-cheat / suspicious result handling の本格運用
- 完成版の日本語タイピングモード
- spectator mode
- authenticated profile
- ranking / rating
- friend / invite flow
- tournaments
- replay
- terms / privacy / contact
- public beta 向け load test
- abuse monitoring / alerting
- 運営からのお知らせ・障害通知 UI

## 今後リファクタ候補として残すもの

#197 / #198 とは別に、必要性が高くなった時点で切り出します。

- practice と online match の入力 UI 共通化
- result stats の計算と表示責務の整理
- E2E helper の追加抽出
- shared event type の整理

「大きいファイルだから」だけでは Issue を増やさず、変更頻度・回帰リスク・テスト容易性に問題が出た時点で具体的に切り出します。
