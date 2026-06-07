# 要件定義

## 目的

ユーザーがオンラインで同じ文章をタイピングし、速度と正確性を競える対戦ゲームを作る。

当面は友人・知人など内輪で遊ぶ用途を優先する。将来的には Web に公開し、知らない人同士でも遊べる public beta / public service に発展できる設計にする。

## MVP

### ユーザー体験

- プレイヤーはニックネームを入力して参加できる。
- プレイヤーは room code を作成できる。
- 別プレイヤーは room code で参加できる。
- 2 人そろったらホストが試合を開始できる。
- 開始前に 3 秒程度のカウントダウンを表示する。
- 試合中は自分の入力欄、課題文、相手の進捗、WPM、正確率を表示する。
- 課題文を打ち終えたら結果画面を表示する。
- 結果画面では順位、WPM、正確率、ミスタイプ数、所要時間を表示する。

### ゲームルール

- すべてのプレイヤーは同じ課題文を使う。
- WPM は標準的に 5 文字を 1 word として計算する。
- 正確率は `正しく入力した文字数 / 入力した文字数` を基準にする。
- 勝者は完走時間を優先し、未完走者は進捗率、WPM、正確率の順で比較する。
- 入力ミスは即時表示するが、次の文字へ進むには正しい文字入力を求める方式を MVP の基本とする。

### リアルタイム同期

- room の参加・退出を全員に通知する。
- countdown start time はサーバーが決定する。
- progress update はサーバーへ送信し、room 内の他プレイヤーへ配信する。
- finish event はサーバーが検証して確定する。
- disconnect は room state に反映する。

### 非機能要件

- MVP は 1 room 2 人対戦を安定させる。
- レイテンシ 100-300ms 程度でも破綻しない UI にする。
- 重要な試合状態はサーバー authoritative にする。
- イベント payload は TypeScript 型で共有する。
- E2E テストで 2 人対戦の基本フローを検証する。
- 内輪向けでも、guest id、room code、nickname validation、基本ログは用意する。

## Private Beta 要件

内輪で URL を共有して遊べる段階の要件。

- ゲスト参加だけで遊べる。
- room code を知っている人だけが参加できる。
- 人がいない場合は COM と遊べる。
- 5-10 試合連続で大きな同期崩れなく遊べる。
- デプロイ先で Web UI と realtime server が動く。
- エラー、切断、試合開始、試合終了をログで追える。
- room 作成、join、typing event に軽い rate limit がある。
- room が無制限に残り続けない。
- reload / short disconnect から復帰できる。
- prompt category を選べる。
- rematch で room を作り直さずに続けられる。
- result に finish gap を出せる。

### 現在満たしている要件

- ゲスト参加だけで遊べる。
- room code を知っている人だけが参加できる。
- 人がいない場合は COM と遊べる。
- reload 後に同じ room へ復帰できる。
- waiting room は TTL cleanup される。
- host leave 時に active human がいれば host transfer される。
- prompt category を `short | standard | long` から選べる。
- room code を維持して rematch できる。
- COM は server-side で進行する。
- long disconnect の forfeit 判定が server 側にある。
- result に finish gap を保持している。

### まだ足りない要件

- デプロイ先で Web UI と realtime server を動かす。
- エラー、切断、試合開始、試合終了を structured log で追えるようにする。
- room 作成、join、typing event に軽い rate limit を入れる。
- COM difficulty selector を UI と event として実装する。
- practice mode の Web UI と result 表示を実装する。
- long disconnect forfeit の broadcast / UI / E2E を固める。
- result analytics UI を表示する。

## Public Beta 要件

知らない人にも遊んでもらう段階の要件。

- 利用規約、プライバシー、問い合わせ先を用意する。
- nickname の禁止語、長さ、表示 escape を強化する。
- 通報、ブロック、退出、ミュート相当の導線を検討する。
- ランダムマッチまたは公開ロビーを追加する。
- サーバー負荷、エラー率、同時接続数を監視する。
- 不正タイピングや bot 的挙動の検知を追加する。

## MVP 後の拡張

- COM 難易度 UI
- room 自動期限切れの TTL 拡張
- 再戦 / 連続試合の UX 拡張
- 課題文カテゴリ・難易度の拡張
- 一人練習 UI
- 結果分析 UI
- プレイヤー設定
- 3-8 人対戦
- ランダムマッチ
- 公開 lobby
- 観戦
- invite link / friends
- ログイン
- レート・ランキング
- フレンド対戦
- 文章カテゴリ選択
- 日本語入力モード
- 通報 / block / moderation
- 不正検知
- 大会モード
- リプレイ
- チャットまたは定型リアクション
- お知らせ / feedback 導線

## 未決定事項

- 日本語 IME 入力を MVP に含めるか。
- 課題文を英語、日本語、コード、記号混在のどれから始めるか。
- 初期リリースの GitHub リポジトリを public にするか private にするか。
- ホスティング先をどこにするか。

## 機能別仕様

詳細は [features/README.md](features/README.md) に分けて管理する。

- [機能カタログ](features/feature-catalog.md)
- [COM 対戦](features/com-opponent.md)
- [マッチメイキング](features/matchmaking.md)
- [切断・再接続](features/disconnect-reconnect.md)
- [Room lifecycle](features/room-lifecycle.md)
- [再戦 / 連続試合](features/rematch-session.md)
- [課題文ライブラリ](features/prompt-library.md)
- [一人練習](features/practice-mode.md)
- [結果分析](features/result-analytics.md)
- [プレイヤー設定](features/player-settings.md)
- [日本語タイピングモード](features/japanese-typing-mode.md)
- [観戦](features/spectator-mode.md)
- [公開 lobby](features/public-lobby.md)
- [通報 / moderation](features/moderation-report.md)
- [不正検知 / abuse prevention](features/anti-cheat-abuse.md)
- [guest identity / profiles](features/profiles-guest-identity.md)
- [ranking / rating](features/ranking-rating.md)
- [friends / invites](features/friends-invites.md)
- [大会](features/tournaments.md)
- [Observability / Rate Limit](features/observability-rate-limit.md)
- [Private Beta デプロイ](features/deployment-private-beta.md)
- [お知らせ / feedback](features/notification-feedback.md)
