# Spectator Mode

試合に参加せず、観戦できる機能です。

## 目的

- 内輪イベントや配信で見やすくする。
- 大会、ランキング、公開 lobby の拡張に備える。
- 参加者ではない人が room に入っても試合状態を壊さないようにする。

## 対象ステージ

- Private beta: 任意。
- Public beta: public lobby や tournament と相性がよい。

## ユーザー体験

- room code から `Watch` を選べる。
- 観戦者は入力欄を持たない。
- 参加者の進捗、WPM、accuracy、finish 状態を見る。
- 観戦者数を表示する。
- host は観戦を許可 / 不許可にできる。

## UI 状態

- `spectator_lobby`: 開始前の観戦。
- `spectator_match`: 試合中の観戦。
- `spectator_result`: 結果の観戦。
- `spectator_blocked`: 観戦不可。

## イベント

```ts
type SpectatorJoinEvent = {
  roomCode: string;
  spectatorId: string;
  nickname?: string;
};

type SpectatorState = {
  spectatorCount: number;
  canChat: false;
};
```

## サーバー挙動

- spectator は player count に含めない。
- spectator には typing input event を許可しない。
- room state の読み取りだけを送る。
- spectator が多い場合、更新頻度を player より落としてもよい。

## 受け入れ条件

- 観戦者が入っても 2 人対戦の開始条件が変わらない。
- 観戦者から progress / finish event を送れない。
- host が観戦不可にした room には入れない。
- 観戦者が退出しても試合に影響しない。

## テスト観点

- 観戦 join / leave。
- spectator event の権限チェック。
- 観戦不可 room。
- 複数 spectator での負荷。

## 未決定事項

- spectator nickname を表示するか。
- 観戦者向け reaction を許可するか。
