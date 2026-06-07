# COM 対戦仕様

## 目的

相手がいない時でも 1 人で対戦体験を試せるようにする。内輪 private beta の前に、ルーム作成後すぐ遊べる状態を維持する。

## 対象ステージ

- MVP: 1 人開始時に COM を自動追加する。
- Private Beta: COM 難易度を選べる。
- Public Beta: マッチ待ち時間が長い場合の fallback として COM を出す。

## 現在の前提

- COM は server authoritative。
- クライアントは COM の進捗を生成しない。
- COM は `PlayerState.isBot = true` として通常 player と同じ room state に含める。
- COM はランキングと結果表示に含める。

## ユーザー体験

### MVP

- host が 1 人だけの room で `Start vs COM` を押せる。
- countdown 後、COM が参加者一覧と進捗欄に表示される。
- ユーザーが完走しても、COM が未完走なら結果は COM 完走まで待つ。
- 結果画面では人間と COM の順位を表示する。
- `Rematch` で再戦できる。

### Private Beta

- host は Lobby で COM 難易度を選べる。
- 難易度は `Easy / Normal / Hard` の 3 段階から始める。
- COM 難易度は room state に保存し、試合開始後は変更できない。

## 難易度案

```txt
Easy:   120-160 CPM, 2-5% miss simulation
Normal: 180-240 CPM, 1-3% miss simulation
Hard:   260-340 CPM, 0-2% miss simulation
```

CPM は characters per minute。WPM 表示は既存の `characters / 5 / minutes` に従う。

MVP では deterministic な固定速度でよい。Private Beta では、試合ごとに seed を使って少し揺らす。

## サーバー挙動

- `match:start` 時点で room に人間が 1 人だけなら COM を追加する。
- COM は socket を持たない internal player として扱う。
- `match:started` 後、server timer が COM progress を更新する。
- COM progress は `player:progress` として room に broadcast する。
- COM が prompt length に到達したら `finishedAt` と `finishTimeMs` を確定する。
- 全員が完走、または切断ルール上終了可能になったら `match:result` を送る。
- rematch 時、COM は残しても削除してもよいが、UI の分かりやすさを優先して waiting では人間だけに戻す。

## データ

```ts
type PlayerState = {
  id: string;
  nickname: string;
  isBot: boolean;
  progressIndex: number;
  correctCharacters: number;
  totalTypedCharacters: number;
  mistakes: number;
  wpm: number;
  accuracy: number;
};

type BotDifficulty = "easy" | "normal" | "hard";

type RoomState = {
  botDifficulty?: BotDifficulty;
};
```

## UI 状態

- Waiting, 1 human: button label は `Start vs COM`
- Waiting, 2 humans: button label は `Start`
- COM row: status は `com`、connection label は `bot`
- Result: COM にも順位を出す
- Rematch 後: COM 難易度が選ばれているなら保持する

## 受け入れ条件

- 1 人 room で開始できる。
- 1 人 room で開始すると COM が room state に追加される。
- COM の進捗がリアルタイムに増える。
- 人間が完走し、COM も完走すると結果が出る。
- COM は結果画面で順位対象になる。
- 2 人 room では COM は追加されない。
- COM progress は client から送れない。

## テスト観点

- Unit: 1 人開始時に COM が追加される。
- Unit: 2 人開始時に COM は追加されない。
- Unit: COM progress が prompt length を超えない。
- Integration: COM 完走で `match:result` が生成される。
- E2E: 1 人で `Start vs COM` して結果表示まで進む。
- E2E: 2 人対戦では COM が表示されない。

## 未決定事項

- COM の速度をユーザーの過去 WPM に合わせるか。
- COM のミスタイプ演出を表示するか。
- COM が人間より先に完走した場合、すぐ結果にするか、人間に最後まで打たせるか。
- COM と対戦した記録をランキング対象に含めるか。
