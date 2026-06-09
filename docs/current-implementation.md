# Current Implementation

現在のコードに入っている機能の整理です。コード品質や責務分割の評価ではなく、「何が動くか」「何が途中か」を把握するためのメモです。

## 実装済み

### 基本対戦

- room code による room 作成・参加。
- 1 room 2 人までの対戦。
- host による match start。
- serverStartAt を使った 3 秒 countdown。
- 同じ prompt を使った typing match。
- progress、WPM、accuracy、miss count の同期。
- finish event による server 側 result 確定。
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

- waiting room の TTL cleanup がある。
- reload rejoin のため、disconnect 直後に room を即削除しない。
- host が leave した時、他の active human がいれば host を移譲する。
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

### Practice mode

- `practice:start` event と server 側の prompt 発行がある。
- Web UI に practice の入口、typing UI、result UI がある。
- practice result を client-side で表示し、`Practice again` で再実行できる。

### Result analytics

- `PlayerResult` に `finishGap` と `maxStreak` の field がある。
- `finishGap` は完走者同士の差分として計算される。
- `maxStreak` は typing progress の累積から更新される。
- Result UI で finish gap と max streak を表示している。

### Tests / CI

- GitHub Actions CI がある。
- lint / typecheck / unit test / build / Playwright E2E を実行する。
- E2E は room join、2 player completion、reload rejoin、COM match、practice mode、long disconnect forfeit、player settings を確認する。
- realtime unit test は room creation、join、finish、rejoin、COM、forfeit を確認する。
- デプロイ後の導線を検証する `smoke test`。

### Player settings

- nickname、theme、sound、input guide、reduced motion、font size の設定ができる。
- modal UI による設定変更。
- localStorage への設定保存と復元。
- theme (system/light/dark) の CSS 変数による動的切り替え。
- reduced motion によるアニメーション停止の制御。
- font size による課題文テキストのサイズ調整。

### Observability / Rate limit

- `pino` による構造化ログ。
- IP、guest id、socket ごとの軽量な rate limit。
- 試合開始、終了、接続数などの基本メトリクス。
- health endpoint (`/health`) によるメトリクス露出。
- 進行度の急激な変化を検知する suspicious detection ログ。

### Deployment

- realtime サーバーの `Dockerfile`。

## 部分実装

## 未実装

- quick match / random matchmaking
- public lobby
- rate limit
- structured logging
- basic monitoring
- deployment / CD smoke
- player settings
- persistent database
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

- realtime room 管理の責務分割。
- server timer と broadcast の整理。
- practice と match の入力 UI 共通化。
- result stats の計算と表示の責務分離。
- E2E helper の抽出。
- shared event type の整理。
