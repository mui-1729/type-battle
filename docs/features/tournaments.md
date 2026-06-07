# Tournaments

複数人・複数試合のイベントを運営するための大会機能です。

## 目的

- 内輪イベントやコミュニティ企画を可能にする。
- 観戦、ランキング、複数 room 管理の上位機能にする。
- Public service で長く遊ばれるコンテンツにする。

## 対象ステージ

- MVP / Private beta: 不要。
- Public service: 検討。

## 形式案

- single elimination
- round robin
- time attack leaderboard
- daily cup
- team battle

## データ

```ts
type Tournament = {
  id: string;
  name: string;
  format: "single_elimination" | "round_robin" | "time_attack";
  status: "draft" | "open" | "running" | "finished";
  startsAt: number;
  maxPlayers: number;
};

type TournamentMatch = {
  tournamentId: string;
  round: number;
  roomCode: string;
  playerIds: string[];
  winnerPlayerId?: string;
};
```

## UI

- tournament list
- registration page
- bracket / standings
- match room links
- spectator links
- admin controls

## サーバー挙動

- tournament match ごとに room を作成する。
- result 確定後に bracket を進める。
- 棄権、切断、遅刻の扱いを明確にする。
- admin が result correction できるようにする。

## 受け入れ条件

- 参加登録できる。
- tournament の room が自動作成される。
- result が bracket に反映される。
- 棄権や未接続時に進行不能にならない。

## テスト観点

- bracket generation。
- result propagation。
- player no-show。
- admin correction。

## 未決定事項

- 最初に実装する tournament 形式。
- admin 権限の持ち方。
- prize / reward を扱うか。
