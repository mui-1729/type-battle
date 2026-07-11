# Current Implementation

現在のコードに入っている機能の整理です。コード品質や責務分割の評価ではなく、「何が動くか」「何が途中か」を把握するためのメモです。

## 実装済み

### 基本対戦

- room code による room 作成・参加。
- 1 room 2 人までの対戦。
- human 対戦では全 human player の ready 後に host が match start できる。1人の場合は COM 戦として開始できる。
- serverStartAt を使った 3 秒 countdown。
- 同じ prompt を使った typing match。
- client は入力差分と sequence を送り、server が prompt に対して progress、WPM、accuracy、miss count を算出する。
- forged progress / finish payload は result 確定に使わない。
- Result 画面で順位、WPM、accuracy、miss count を表示。

### COM 対戦

- host が 1 人だけの room で `Start vs COM` できる。
- COM difficulty selector がある。
- selector で `easy | normal | hard` を切り替えられる。
- `room:setBotDifficulty` event で server 側に反映する。
- server 側で COM player を追加する。
- COM は `isBot = true` の player として room state に含まれる。
- COM は選択した難易度名つきで表示される。
- COM は server timer で progress する。
- COM の速度には簡単な揺らぎと miss chance がある。

### Room lifecycle

- activity 基準の TTL cleanup がある。接続中の waiting / finished room は TTL だけでは削除しない。
- reload rejoin のため、disconnect 直後に room を即削除しない。
- host が leave / disconnect した時、COM を host にせず human host を維持または復旧する。
- room code を維持した rematch ができる。
- rematch で progress、result、serverStartAt を reset する。
- long disconnect の forfeit 判定後、room state が更新される。

### Reconnect / Disconnect

- guest id と room code を localStorage に保存する。
- reload 後、同じ guest id / room code で rejoin する。
- existing guest id は waiting / playing room に再接続できる。
- disconnect 時に player.connected を false にする。
- playing 中に 30 秒以上 disconnect した player を forfeit として扱う処理がある。

### Prompt

- prompt は shared package の static list で管理している。
- category は `short | standard | long`。
- waiting lobby で host が prompt category を変更できる。
- match start 時に server が category に応じて prompt を選ぶ。
- prompt 定義の空文字や制御文字を検証して、無効なものを弾く。
- room の再戦では直前と同じ prompt をできるだけ避ける。

### Practice mode

- `practice:start` event と server 側の prompt 発行がある。
- Web UI に practice の入口、typing UI、result UI がある。
- practice result を client-side で表示し、`Practice again` で再実行できる。
- daily challenge は Asia/Tokyo の日付境界で切り替わる。
- daily challenge の結果を localStorage に保存し、今日のベストを表示する。

### Result analytics

- ミス傾向を localStorage に蓄積し、よくミスする文字を棒グラフで表示している。
- 期待文字ごとのミス回数と、最頻の誤入力を確認できる。
- `PlayerResult` に `finishGap` と `maxStreak` の field がある。
- `finishGap` は完走者同士の差分として計算される。
- `maxStreak` は typing progress の累積から更新される。
- Result UI で finish gap と max streak を表示している。

### Tests / CI

- GitHub Actions CI がある。
- lint / typecheck / unit test / build / Playwright E2E を実行する。
- E2E は room join、2 player completion、reload rejoin、COM match、practice mode、long disconnect forfeit、player settings を確認する。
- Cloudflare Worker test は room authority 経路の room creation、join、finish、rejoin、COM、forfeit、storage persistence を確認する。
- Cloudflare Worker runtime test は room authority の state persistence と restart 後の復元を確認する。

### Player settings

- nickname、theme、input guide、reduced motion、font size の設定ができる。
- modal UI による設定変更。
- localStorage への設定保存と復元。
- theme (system/light/dark) の CSS 変数による動的切り替え。
- reduced motion によるアニメーション停止の制御。
- font size による課題文テキストのサイズ調整。
- sound / countdown sound を typing / countdown の再生に wiring している。

### Feedback / Session / Persistence

- private beta feedback issue flow がある。
- Home と result 画面から feedback page に遷移できる。
- GitHub issue template で room code / steps / expected / actual を収集できる。
- guest session を localStorage で保存し、reload / reconnect に使っている。
- Cloudflare Durable Object storage に guest session と match result を記録でき、retention cleanup で期限切れ record を削除する。

### Observability / Rate limit

- IP、guest id、socket ごとの軽量な rate limit。
- `/health` は liveness、`/ready` は Durable Object storage readiness、`/metrics` は gateway metrics を返す。
- WebSocket message size、identifier、room socket、未参加 socket idle timeout の上限がある。

### Deployment

- Cloudflare Worker の `wrangler.toml`。
- `.github/workflows/deploy-cloudflare-worker.yml` で CI 成功済み commit SHA を production environment approval 後に deploy できる。
- `npm run test:e2e` による Cloudflare transport の browser flow 確認。

## 部分実装

### Cloudflare transport contract

- `packages/shared/src/cloudflare-events.ts` に Cloudflare 向けの message contract がある。
- `apps/web/app/_lib/realtime-client.ts` で Cloudflare WebSocket transport を扱う。
- `apps/cloudflare-worker` に Cloudflare 側の realtime backend があり、room 操作は room code ごとの `RoomAuthorityDurableObject` が唯一の authority になる。

### Deployment automation / operations

- web は Vercel Git integration 前提。
- Worker は GitHub Actions の手動 deploy workflow で検証済み commit を deploy する。
- production environment / Cloudflare secret / Worker URL は GitHub と Cloudflare 側の設定が必要。

## 未実装

- Redis scaling
- profile / ranking / rating
- moderation / report / block
- Japanese typing mode
- spectator mode
- invite links / friends
- tournaments
- notification / feedback UI

## 後でリファクタする候補

現時点では機能追加を優先し、次は後で整理する。

- shared の legacy room-engine は unit tests 用に残っている。production room 操作は room authority へ集約済み。
- server timer と broadcast の整理。
- practice と match の入力 UI 共通化。
- result stats の計算と表示の責務分離。
- E2E helper の抽出。
- shared event type の整理。
