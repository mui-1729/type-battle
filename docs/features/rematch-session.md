# Rematch / Session Flow

1 試合で終わらず、同じ相手と自然に複数試合を続けられるようにする機能です。

## 目的

- 内輪で連続して遊ぶ時の操作回数を減らす。
- 試合終了後に room を作り直さなくてよい体験にする。
- COM 対戦、人間同士、将来の quick match のどれでも共通して扱える session flow を作る。

## 対象ステージ

- Private beta: 必須に近い。
- Public beta: quick match と組み合わせて必要。

## ユーザー体験

- 結果画面に `Rematch` と `Leave` を表示する。
- 両者が `Rematch` を押すと新しい課題文で countdown に戻る。
- 片方だけが押した場合は待機状態を表示する。
- 相手が退出した場合、人間相手なら lobby に戻り、COM 相手なら即再戦できる。
- 連続試合数と直近の勝敗を表示する。

## UI 状態

- `result`: 通常の結果表示。
- `rematch_requested`: 自分が再戦希望、相手待ち。
- `rematch_ready`: 両者が再戦希望、次試合の準備中。
- `opponent_left`: 相手退出。
- `session_summary`: 任意。複数試合の合計結果を表示。

## イベント

```ts
type RematchRequestEvent = {
  roomCode: string;
  playerId: string;
};

type RematchStateEvent = {
  roomCode: string;
  requestedPlayerIds: string[];
  nextRoundStartsAt?: number;
};

type SessionSummary = {
  roomCode: string;
  roundCount: number;
  winsByPlayerId: Record<string, number>;
};
```

## サーバー挙動

- 結果確定後のみ rematch request を受け付ける。
- 全 active player が rematch 済みになったら新しい round を生成する。
- round ごとに prompt、start time、result を分けて保持する。
- COM は設定により自動 rematch 可にする。
- 退出済み player は rematch 条件から除外する。

## 受け入れ条件

- 2 人が `Rematch` を押すと room code を変えずに次試合が始まる。
- 片方だけが押した時に待機表示が崩れない。
- 相手が退出した時に無限待機にならない。
- 3 試合連続しても result と progress が前試合から漏れない。

## テスト観点

- 人間 2 人の rematch 成功。
- COM 対戦の rematch 成功。
- 片方退出時の表示。
- rematch 中の reload / reconnect。
- 前 round の finish event が次 round に影響しないこと。

## 未決定事項

- 連続対戦の上限を設けるか。
- rematch の timeout を何秒にするか。
- session summary を Private beta から出すか。
